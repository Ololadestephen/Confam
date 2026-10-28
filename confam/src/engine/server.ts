import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { finished } from "node:stream/promises";

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("Could not reserve a local port.");
  return address.port;
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

export async function startServer(appDirectory: string, dbPath: string, logPath: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const log = createWriteStream(logPath, { flags: "a" });
  const child = spawn(process.execPath, ["server.js"], {
    cwd: appDirectory,
    // Keep API keys and other owner environment variables away from variant apps.
    env: { PATH: process.env.PATH, PORT: String(port), DB_PATH: dbPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let spawnError: Error | undefined;
  child.once("error", (error) => { spawnError = error; });
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= (async () => {
    await stopProcess(child);
    await closed;
    log.end();
    await finished(log);
  })();
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      signal?.throwIfAborted();
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("App exited before becoming healthy; see server.log.");
      try {
        const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(200) });
        if (response.ok && !signal?.aborted) return { baseUrl, port, stop };
      } catch {
        // A refused connection is expected while the app starts.
      }
      await delay(50);
    }
    throw new Error("App did not become healthy within the startup limit; see server.log.");
  } catch (error) {
    await stop();
    throw error;
  }
}
