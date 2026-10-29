import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectRuntime } from "./config.js";
import { createProjectLifecycle, startProjectServer } from "./runtime.js";

const directories: string[] = [];
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-runtime-"));
  directories.push(directory);
  const app = path.join(directory, "app");
  await mkdir(path.join(app, "nested"), { recursive: true });
  await writeFile(path.join(app, "nested/entry.cjs"), `
const http = require('node:http');
const fs = require('node:fs');
fs.appendFileSync(process.env.CASE_STATE, 'started\\n');
console.log('configured entry started');
http.createServer((req,res) => {
  if(req.url === '/ready-custom') { res.end('ready'); return; }
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({state:fs.readFileSync(process.env.CASE_STATE,'utf8'), secret:process.env.CONFAM_TEST_PRIVATE_VALUE ?? null}));
}).listen(Number(process.env.CASE_PORT),'127.0.0.1');
`);
  const runtime: ProjectRuntime = {
    command: [process.execPath, "entry.cjs"], cwd: "nested", readinessPath: "/ready-custom",
    timeoutMs: 2000, portVariable: "CASE_PORT", dataVariable: "CASE_STATE", restart: true,
  };
  return { directory, app, runtime };
}

describe("configured local runtime", () => {
  it("uses configured entry/readiness/environment and flushes logs", async () => {
    const { directory, app, runtime } = await fixture();
    process.env.CONFAM_TEST_PRIVATE_VALUE = "must-not-inherit";
    let server;
    try {
      server = await startProjectServer(app, path.join(directory, "state"), path.join(directory, "server.log"), runtime);
    } finally { delete process.env.CONFAM_TEST_PRIVATE_VALUE; }
    stops.push(server.stop);
    const response = await fetch(server.baseUrl);
    expect(await response.json()).toEqual({ state: "started\n", secret: null });
    await server.stop();
    await server.stop();
    expect(await readFile(path.join(directory, "server.log"), "utf8")).toContain("configured entry started");
    await expect(fetch(server.baseUrl)).rejects.toThrow();
  });

  it("preserves state on restart, resets only owned data, and isolates variants", async () => {
    const { directory, app, runtime } = await fixture();
    const first = createProjectLifecycle(app, path.join(directory, "one"), runtime);
    const second = createProjectLifecycle(app, path.join(directory, "two"), runtime);
    stops.push(first.stop, second.stop);
    await first.start(); await second.start();
    await expect(first.reset()).rejects.toThrow("Stop");
    await first.restart();
    expect(await readFile(first.dataPath, "utf8")).toBe("started\nstarted\n");
    expect(await readFile(second.dataPath, "utf8")).toBe("started\n");
    await first.stop(); await first.reset();
    await expect(readFile(first.dataPath)).rejects.toThrow();
    expect(await readFile(second.dataPath, "utf8")).toBe("started\n");
  });

  it("rejects unsupported restart without stopping the project", async () => {
    const { directory, app, runtime } = await fixture();
    const lifecycle = createProjectLifecycle(app, path.join(directory, "variant"), { ...runtime, restart: false });
    stops.push(lifecycle.stop);
    const server = await lifecycle.start();
    await expect(lifecycle.restart()).rejects.toThrow("does not support");
    expect((await fetch(server.baseUrl + "/ready-custom")).ok).toBe(true);
  });

  it("rejects spawn failure and nonready startup with bounded cleanup", async () => {
    const { directory, app, runtime } = await fixture();
    await expect(startProjectServer(app, path.join(directory, "state"), path.join(directory, "missing.log"), {
      ...runtime, command: ["/definitely-missing-confam-command"],
    })).rejects.toThrow();
    await expect(startProjectServer(app, path.join(directory, "state"), path.join(directory, "timeout.log"), {
      ...runtime, command: [process.execPath, "-e", "setInterval(()=>{},1000)"], timeoutMs: 100,
    })).rejects.toThrow("deadline");
  });

  it("cancels an in-flight startup and refuses an escaping cwd", async () => {
    const { directory, app, runtime } = await fixture();
    const controller = new AbortController();
    const pending = startProjectServer(app, path.join(directory, "state"), path.join(directory, "abort.log"), {
      ...runtime, command: [process.execPath, "-e", "setInterval(()=>{},1000)"],
    }, controller.signal);
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toThrow();
    await symlink(directory, path.join(app, "outside"));
    await expect(startProjectServer(app, path.join(directory, "state"), path.join(directory, "escape.log"), {
      ...runtime, cwd: "outside",
    })).rejects.toThrow("Symlink");
  });

  it("refuses a symlink data directory during reset", async () => {
    const { directory, app, runtime } = await fixture();
    const variant = path.join(directory, "variant");
    const other = path.join(directory, "other");
    await mkdir(variant); await mkdir(other);
    await writeFile(path.join(other, "keep"), "untouched");
    await symlink(other, path.join(variant, "data"));
    const lifecycle = createProjectLifecycle(app, variant, runtime);
    await expect(lifecycle.reset()).rejects.toThrow("Symlink");
    expect(await readFile(path.join(other, "keep"), "utf8")).toBe("untouched");
  });
});

it("stops descendants that ignore graceful termination on POSIX", async () => {
  if (process.platform === "win32") return;
  const { directory, app, runtime } = await fixture();
  const descendant = `process.on('SIGTERM',()=>{}); setInterval(()=>require('node:fs').appendFileSync(process.argv[1],'tick\\n'),20);`;
  await writeFile(path.join(app, "nested/entry.cjs"), `
const {spawn}=require('node:child_process');
spawn(process.execPath,['-e',${JSON.stringify(descendant)},process.env.CASE_STATE],{stdio:'inherit'});
require('node:http').createServer((req,res)=>res.end('ready')).listen(Number(process.env.CASE_PORT),'127.0.0.1');
`);
  const state = path.join(directory, "heartbeat");
  const server = await startProjectServer(app, state, path.join(directory, "descendant.log"), runtime);
  stops.push(server.stop);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await server.stop();
  const stopped = await readFile(state, "utf8");
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(await readFile(state, "utf8")).toBe(stopped);
});

it("treats a denied existence probe as live and still completes shutdown", async () => {
  if (process.platform === "win32") return;
  const { directory, app, runtime } = await fixture();
  const server = await startProjectServer(app, path.join(directory, "state"), path.join(directory, "probe.log"), runtime);
  stops.push(server.stop);
  const kill = process.kill.bind(process);
  let deniedProbe = false;
  const spy = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
    if (pid < 0 && signal === 0 && !deniedProbe) {
      deniedProbe = true;
      throw Object.assign(new Error("existence probe denied"), { code: "EPERM" });
    }
    return kill(pid, signal);
  });
  try { await server.stop(); }
  finally { spy.mockRestore(); }
  expect(deniedProbe).toBe(true);
  await expect(fetch(server.baseUrl)).rejects.toThrow();
});

it("retains a startup cleanup failure and never reports the lifecycle stopped", async () => {
  if (process.platform === "win32") return;
  const { directory, app, runtime } = await fixture();
  const lifecycle = createProjectLifecycle(app, path.join(directory, "failed-cleanup"), {
    ...runtime, command: [process.execPath, "-e", "setInterval(()=>{},1000)"], timeoutMs: 100,
  });
  const kill = process.kill.bind(process);
  let spawnedGroup: number | undefined;
  const spy = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
    if (pid < 0 && signal === "SIGTERM") {
      spawnedGroup = pid;
      throw Object.assign(new Error("termination denied"), { code: "EPERM" });
    }
    return kill(pid, signal);
  });
  try {
    await expect(lifecycle.start()).rejects.toThrow("startup cleanup failed");
    await expect(lifecycle.stop()).rejects.toThrow("startup cleanup failed");
    await expect(lifecycle.start()).rejects.toThrow("startup cleanup failed");
    expect(spawnedGroup).toBeDefined();
  } finally {
    spy.mockRestore();
    if (spawnedGroup !== undefined) { try { kill(spawnedGroup, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; } }
  }
});

it("allows lifecycle stop after a readiness failure whose cleanup succeeded", async () => {
  const { directory, app, runtime } = await fixture();
  const lifecycle = createProjectLifecycle(app, path.join(directory, "clean-failure"), {
    ...runtime, command: [process.execPath, "-e", "setInterval(()=>{},1000)"], timeoutMs: 100,
  });
  await expect(lifecycle.start()).rejects.toThrow("deadline");
  await expect(lifecycle.stop()).resolves.toBeUndefined();
});
