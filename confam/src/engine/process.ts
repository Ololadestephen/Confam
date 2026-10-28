import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const MAX_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await executeFile("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
