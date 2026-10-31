import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { executionFixture, until } from "./fixtures.test-helper.js";
import { ExecutionManager } from "./manager.js";
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
it("runs a frozen ordinary verification through a worker and preserves real evidence/progress", async () => {
  const f = await executionFixture();
  cleanups.push(() => f.cleanup());
  const preview = await f.manager.prepare(f.draft.id, {
    name: "good.patch",
    text: f.patch,
  });
  expect(preview.status).toBe("ready");
  expect(preview.events).toEqual([]);
  await expect(f.manager.start(preview.id, "0".repeat(64))).rejects.toThrow(
    "Review",
  );
  await f.manager.start(preview.id, preview.preview.hash);
  await expect(
    f.manager.start(preview.id, preview.preview.hash),
  ).rejects.toThrow("only once");
  const result = await until(
    () => f.manager.get(preview.id),
    (job) => !["running", "cancelling"].includes(job.status),
  );
  expect(result.status).toBe("completed");
  expect(result.cleanupComplete).toBe(true);
  expect(result.events.some((event) => event.phase === "step")).toBe(true);
  const report = JSON.parse(
    await readFile(
      path.join(f.runs, result.runId!, "verification.json"),
      "utf8",
    ),
  );
  expect(report.variants[0].result.status).toBe("assertion-failed");
  expect(report.candidate).toBe("passed");
  expect(report.confirmation).toBe("fixture");
  expect(report.cleanupComplete).toBe(true);
  expect(report.limitations.join(" ")).toContain("false-rejection calibration");
  const reopened = new ExecutionManager(
    f.onboarding,
    path.join(f.registryDirectory, "jobs"),
    f.runs,
  );
  expect((await reopened.get(preview.id)).status).toBe("completed");
  await reopened.close();
}, 30000);
it("rejects modified confirmed/frozen inputs and noneditable app changes before launch", async () => {
  const f = await executionFixture();
  cleanups.push(() => f.cleanup());
  let job = await f.manager.prepare(f.draft.id);
  const frozen = path.join(
    f.registryDirectory,
    "jobs",
    job.id,
    "input",
    "workflow.json",
  );
  await writeFile(
    frozen,
    JSON.stringify({ schemaVersion: 1, steps: [{ action: "reached" }] }),
  );
  await expect(f.manager.start(job.id, job.preview.hash)).rejects.toThrow(
    "changed",
  );
  expect((await f.manager.get(job.id)).status).toBe("ready");
  job = await f.manager.prepare(f.draft.id);
  await writeFile(
    path.join(f.projectRoot, "app", "helper.txt"),
    "changed runtime context",
  );
  await expect(f.manager.start(job.id, job.preview.hash)).rejects.toThrow(
    "changed",
  );
  await writeFile(
    f.draft.files!.workflow,
    JSON.stringify({ schemaVersion: 1, steps: [{ action: "reached" }] }),
  );
  await expect(f.manager.prepare(f.draft.id)).rejects.toThrow("changed");
});
it("serializes all servers and cancels during real readiness with process cleanup", async () => {
  const source = `const http=require('node:http');const fs=require('node:fs');fs.writeFileSync(process.env.STATE,JSON.stringify({pid:process.pid}));http.createServer((q,s)=>{s.writeHead(503);s.end('not ready')}).listen(Number(process.env.PORT),'127.0.0.1');`;
  const f = await executionFixture({ source });
  cleanups.push(() => f.cleanup());
  const first = await f.manager.prepare(f.draft.id);
  const other = new ExecutionManager(
    f.onboarding,
    path.join(f.registryDirectory, "jobs"),
    f.runs,
  );
  cleanups.push(() => other.close());
  const second = await other.prepare(f.draft.id);
  await f.manager.start(first.id, first.preview.hash);
  const state = await until(
    async () => {
      const job = await f.manager.get(first.id);
      if (!job.runId) return undefined;
      try {
        return JSON.parse(
          await readFile(
            path.join(f.runs, job.runId, "variants/original/data/state"),
            "utf8",
          ),
        );
      } catch {
        return undefined;
      }
    },
    (value) => !!value,
  );
  await expect(other.start(second.id, second.preview.hash)).rejects.toThrow(
    "one job",
  );
  await f.manager.cancel(first.id);
  const result = await until(
    () => f.manager.get(first.id),
    (job) => !["running", "cancelling"].includes(job.status),
  );
  expect(result.status).toBe("cancelled");
  expect(result.cleanupComplete).toBe(true);
  expect(result.verdict).toBeUndefined();
  expect(() => process.kill(state.pid, 0)).toThrow();
  expect(await f.manager.store.lease()).toBeUndefined();
}, 30000);
it("never overwrites a terminal result that lands while the job is being read", async () => {
  const f = await executionFixture({});
  cleanups.push(() => f.cleanup());
  const job = await f.manager.prepare(f.draft.id);
  await f.manager.store.write({ ...job, status: "cancelling", startedAt: new Date().toISOString() });
  // The worker finishes between the manager's two reads: it writes its result, then releases the lease.
  const store = f.manager.store;
  const lease = store.lease.bind(store);
  store.lease = async () => {
    const current = await store.read(job.id);
    await store.write({ ...current, status: "cancelled", cleanupComplete: true, finishedAt: new Date().toISOString() });
    return lease();
  };
  expect((await f.manager.get(job.id)).status).toBe("cancelled");
  expect((await store.read(job.id)).status).toBe("cancelled");
});
it("parent crash interrupts the worker, cleans app resources and leaves restartable evidence", async () => {
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const source = `const http=require('node:http');const fs=require('node:fs');fs.writeFileSync(process.env.STATE,JSON.stringify({pid:process.pid}));http.createServer((q,s)=>{s.writeHead(503);s.end('not ready')}).listen(Number(process.env.PORT),'127.0.0.1');`;
  const f = await executionFixture({ source });
  cleanups.push(() => f.cleanup());
  const job = await f.manager.prepare(f.draft.id);
  const host = spawn(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      fileURLToPath(new URL("./host.test-helper.ts", import.meta.url)),
      f.registryDirectory,
      f.runs,
      job.id,
      job.preview.hash,
    ],
    {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { PATH: process.env.PATH },
    },
  );
  cleanups.push(async () => {
    if (host.exitCode === null && host.signalCode === null)
      host.kill("SIGKILL");
  });
  const pid = await until(
    async () => {
      const saved = await f.manager.store.read(job.id);
      if (!saved.runId) return undefined;
      try {
        return JSON.parse(
          await readFile(
            path.join(f.runs, saved.runId, "variants/original/data/state"),
            "utf8",
          ),
        ).pid;
      } catch {
        return undefined;
      }
    },
    (value) => typeof value === "number",
  );
  host.kill("SIGKILL");
  const result = await until(
    () => f.manager.store.read(job.id),
    (saved) =>
      ["interrupted", "cancelled", "error", "completed"].includes(saved.status),
  );
  expect(result.status).toBe("interrupted");
  expect(result.cleanupComplete).toBe(true);
  expect(result.verdict).toBeUndefined();
  expect(() => process.kill(pid, 0)).toThrow();
  expect(await f.manager.store.lease()).toBeUndefined();
  const restart = new ExecutionManager(
    f.onboarding,
    path.join(f.registryDirectory, "jobs"),
    f.runs,
  );
  expect((await restart.get(job.id)).status).toBe("interrupted");
  await restart.close();
}, 30000);
