import type { ProjectRuntime } from "../project/config.js";
import { legacyProjectConfig } from "../project/legacy.js";
import { startProjectServer } from "../project/runtime.js";

// Historical callers retain their signature; new runs supply their sealed runtime.
export async function startServer(appDirectory: string, dataPath: string, logPath: string, signal?: AbortSignal, runtime?: ProjectRuntime) {
  return startProjectServer(appDirectory, dataPath, logPath, runtime ?? (await legacyProjectConfig()).runtime, signal);
}
