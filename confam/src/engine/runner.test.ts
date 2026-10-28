import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { chromium } from "@playwright/test";
import { freezeChecks } from "./freeze.js";
import { runBrowserChecks } from "./runner.js";

vi.mock("@playwright/test", () => ({ chromium: { launch: vi.fn() } }));
const directories: string[] = [];
afterEach(async () => { vi.useRealTimers(); for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

it("cancels and settles a pending restart before returning a browser timeout", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-runner-"));
  directories.push(directory);
  const source = path.join(directory, "workflow.ts");
  await writeFile(source, "export async function runChecks(run) { run.reached(); await run.restartApp(); }\n");
  const checks = await freezeChecks(path.join(directory, "checks"), source, { customerPhone: "1", otherCustomerPhone: "2", service: "Braids", date: "2026-10-31", slotLabel: "2:00 PM", startsAt: "2026-10-31T14:00" });
  const context = { setDefaultTimeout: vi.fn(), setDefaultNavigationTimeout: vi.fn(), on: vi.fn(), tracing: { start: vi.fn(), stop: vi.fn() }, newPage: vi.fn().mockResolvedValue({}), close: vi.fn() };
  const browser = { newContext: vi.fn().mockResolvedValue(context), close: vi.fn() };
  vi.mocked(chromium.launch).mockResolvedValue(browser as never);
  let rejectRestart!: (error: Error) => void;
  const restart = vi.fn(() => new Promise<string>((_resolve, reject) => { rejectRestart = reject; }));
  const cancel = vi.fn(async () => { rejectRestart(new Error("restart aborted")); });
  const execution = runBrowserChecks(checks, "http://localhost", path.join(directory, "evidence"), { restartApp: restart, cancel, timeoutMs: 20 });
  expect((await execution).status).toBe("timeout");
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(context.close).toHaveBeenCalled();
  expect(browser.close).toHaveBeenCalled();
});
