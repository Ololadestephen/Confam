import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, lstat, rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { finished } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { confinedPath, type ProjectRuntime } from "./config.js";

const SHUTDOWN_GRACE_MS = 2000;

export interface ProjectServer {
  baseUrl: string;
  port: number;
  stop(): Promise<void>;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("Could not allocate a project port.");
  return address.port;
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function processTreeExists(child: ChildProcess): boolean {
  if (!child.pid) return false;
  if (process.platform === "win32") return child.exitCode === null && child.signalCode === null;
  try { process.kill(-child.pid, 0); return true; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    // A zero-signal EPERM establishes existence, not permission to terminate.
    // Actual SIGTERM/SIGKILL denials still propagate from signalProcessTree.
    if (code === "EPERM") return true;
    throw error;
  }
}

async function stopProcessTree(child: ChildProcess): Promise<void> {
  signalProcessTree(child, "SIGTERM");
  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (processTreeExists(child) && Date.now() < deadline) await delay(20);
  if (processTreeExists(child)) signalProcessTree(child, "SIGKILL");
}

function runtimeEnvironment(runtime: ProjectRuntime, port: number, dataPath: string): NodeJS.ProcessEnv {
  const reserved = new Set(["PATH", "HOME", "NODE_OPTIONS", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "MODEL_API_KEY"]);
  if (runtime.portVariable === runtime.dataVariable
    || reserved.has(runtime.portVariable) || reserved.has(runtime.dataVariable)) {
    throw new Error("Runtime port/data bindings conflict with protected environment variables.");
  }
  return { PATH: process.env.PATH, [runtime.portVariable]: String(port), [runtime.dataVariable]: dataPath };
}

interface StartupErrors { spawn?: Error; log?: Error; }

async function waitForReadiness(
  child: ChildProcess, baseUrl: string, runtime: ProjectRuntime, errors: StartupErrors, signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + runtime.timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (errors.spawn) throw errors.spawn;
    if (errors.log) throw errors.log;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Project exited before readiness; see its runtime log.");
    }
    try {
      const response = await fetch(`${baseUrl}${runtime.readinessPath}`, {
        redirect: "error", signal: AbortSignal.timeout(Math.max(1, Math.min(200, deadline - Date.now()))),
      });
      await response.body?.cancel();
      if (response.ok && !signal?.aborted) return;
    } catch {
      // Refused connections and nonready responses are expected during startup.
    }
    await delay(25);
  }
  throw new Error("Project readiness deadline exceeded; see its runtime log.");
}

export async function startProjectServer(
  appDirectory: string, dataPath: string, logPath: string, runtime: ProjectRuntime, signal?: AbortSignal,
): Promise<ProjectServer> {
  signal?.throwIfAborted();
  const cwd = await confinedPath(appDirectory, runtime.cwd ?? ".");
  if (!(await lstat(cwd)).isDirectory()) throw new Error("Runtime working directory must be a directory.");
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = runtimeEnvironment(runtime, port, path.resolve(dataPath));
  signal?.throwIfAborted();
  const [command, ...args] = runtime.command;
  if (!command) throw new Error("Project runtime command is empty.");
  const log = createWriteStream(logPath, { flags: "a" });
  const errors: StartupErrors = {};
  log.on("error", (error) => { errors.log = error; });
  const child = spawn(command, args, {
    cwd, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.on("error", (error) => { errors.spawn = error; });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= (async () => {
    signal?.removeEventListener("abort", abort);
    await stopProcessTree(child);
    // SIGKILL closes inherited pipes from descendants in the same process group.
    await closed;
    log.end();
    await finished(log);
  })();
  const abort = () => { void stop().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await waitForReadiness(child, baseUrl, runtime, errors, signal);
    return { baseUrl, port, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

export function createProjectLifecycle(appDirectory: string, variantDirectory: string, runtime: ProjectRuntime) {
  const dataDirectory = path.resolve(variantDirectory, "data");
  const dataPath = path.join(dataDirectory, "state");
  const logPath = path.resolve(variantDirectory, "runtime.log");
  let server: ProjectServer | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation);
    queue = next.catch(() => undefined);
    return next;
  };
  const start = async (signal?: AbortSignal) => {
    if (server) throw new Error("Project is already running.");
    await mkdir(variantDirectory, { recursive: true });
    await mkdir(dataDirectory, { recursive: true });
    await confinedPath(variantDirectory, "data");
    server = await startProjectServer(appDirectory, dataPath, logPath, runtime, signal);
    return server;
  };
  return {
    dataDirectory, dataPath, logPath,
    start: (signal?: AbortSignal) => serial(() => start(signal)),
    restart: (signal?: AbortSignal) => serial(async () => {
      if (!runtime.restart) throw new Error("Project does not support restart.");
      if (!server) throw new Error("Cannot restart a stopped project.");
      await server.stop(); server = undefined;
      return start(signal);
    }),
    stop: () => serial(async () => { await server?.stop(); server = undefined; }),
    reset: () => serial(async () => {
      if (server) throw new Error("Stop the project before resetting its data.");
      await mkdir(variantDirectory, { recursive: true });
      await mkdir(dataDirectory, { recursive: true });
      await confinedPath(variantDirectory, "data");
      await rm(dataDirectory, { recursive: true });
      await mkdir(dataDirectory);
    }),
  };
}
