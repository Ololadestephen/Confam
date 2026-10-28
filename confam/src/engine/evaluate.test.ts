import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckResult, VariantSpec } from "./contracts.js";
import { evaluateVariant } from "./evaluate.js";
import { startServer } from "./server.js";
import { runBrowserChecks } from "./runner.js";
import { guardPatch } from "./variants.js";

vi.mock("./freeze.js", () => ({ verifyChecks: vi.fn() }));
vi.mock("./variants.js", () => ({ createVariant: vi.fn(), guardPatch: vi.fn() }));
vi.mock("./runner.js", () => ({ runBrowserChecks: vi.fn() }));
vi.mock("./server.js", () => ({ startServer: vi.fn() }));

const directories: string[] = [];
const passed: CheckResult = { status: "passed", reached: true, assertions: [], steps: [], durationMs: 1, trace: "trace.zip", videos: [] };
const candidate: VariantSpec = { id: "candidate", kind: "candidate", patch: "candidate.patch", requirements: [] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runBrowserChecks).mockResolvedValue({ ...passed });
  vi.mocked(startServer).mockResolvedValue({ baseUrl: "http://127.0.0.1:12345", port: 12345, stop: vi.fn().mockResolvedValue(undefined) });
});
afterEach(async () => {
  vi.useRealTimers();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function fixture(holds: boolean) {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), "confam-evaluate-"));
  directories.push(runDirectory);
  return {
    runDirectory, baseline: "baseline", checks: { directory: "frozen", sha256: "hash" },
    subject: { customerPhone: "1", otherCustomerPhone: "2", service: "Braids", date: "2026-10-31", slotLabel: "2:00 PM", startsAt: "2026-10-31T14:00" },
    probes: { saved: { description: "saved", run: vi.fn().mockResolvedValue({ holds, observed: {} }) } },
  };
}

describe("variant evaluation boundaries", () => {
  it("does not pass a candidate when its oracle contradicts passing browser checks", async () => {
    const run = await fixture(false);
    expect((await evaluateVariant(candidate, run)).outcome).toBe("unconfirmed");
    run.probes.saved.run.mockResolvedValue({ holds: true, observed: {} });
    expect((await evaluateVariant(candidate, run)).outcome).toBe("passed");
  });

  it("rejects protected candidate patches before creating or launching an app", async () => {
    vi.mocked(guardPatch).mockRejectedValue(new Error("protected path"));
    const result = await evaluateVariant(candidate, await fixture(true));
    expect(result.outcome).toBe("rejected");
    expect(startServer).not.toHaveBeenCalled();
  });

  it("separates startup failure from a decoy caught by a check", async () => {
    vi.mocked(startServer).mockRejectedValue(new Error("syntax error"));
    const result = await evaluateVariant({ id: "decoy", kind: "development", requirements: [{ probe: "saved", holds: false }] }, await fixture(false));
    expect(result.outcome).toBe("invalid");
    expect(result.checks).toBeUndefined();
  });

  it.each([false, true])("requires separately recorded write-error evidence for T4 (present: %s)", async (present) => {
    const run = await fixture(false);
    const directory = path.join(run.runDirectory, "variants/t4");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "server.log"), present ? "Could not save appointment: FOREIGN KEY constraint failed\n" : "");
    vi.mocked(runBrowserChecks).mockResolvedValue({ ...passed, status: "assertion-failed", expectationId: "E1" });
    const result = await evaluateVariant({ id: "t4", kind: "development", requirements: [{ probe: "saved", holds: false }], serverErrorIncludes: "Could not save appointment:" }, run);
    expect(result.outcome).toBe(present ? "caught" : "unconfirmed");
    expect(result.serverErrors).toHaveLength(present ? 1 : 0);
  });

  it("cancels and settles a restart before returning an oracle timeout", async () => {
    const run = await fixture(true);
    const stopped = vi.fn().mockResolvedValue(undefined);
    vi.mocked(startServer).mockReset().mockResolvedValueOnce({ baseUrl: "http://localhost", port: 1, stop: stopped });
    let restarting = false;
    let aborted = false;
    vi.mocked(startServer).mockImplementationOnce(async (_app, _db, _log, signal) => {
      restarting = true;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
      });
    });
    run.probes.saved.run.mockImplementation(async (context: { restartApp(): Promise<void>; }) => {
      await context.restartApp();
      return { holds: true, observed: {} };
    });
    vi.useFakeTimers();
    const evaluation = evaluateVariant(candidate, run);
    await vi.waitFor(() => expect(restarting).toBe(true));
    await vi.advanceTimersByTimeAsync(10_001);
    const result = await evaluation;
    expect(result.outcome).toBe("execution-error");
    expect(result.error).toContain("Oracle execution exceeded");
    expect(aborted).toBe(true);
    expect(stopped).toHaveBeenCalled();
  });
});
