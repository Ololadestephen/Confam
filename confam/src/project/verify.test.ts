import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { verifyProject } from "./verify.js";
import { runWorkflow, type WorkflowResult } from "../workflows/runner.js";

vi.mock("../workflows/runner.js", () => ({ runWorkflow: vi.fn() }));
const runtime = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock("./runtime.js", () => ({
  createProjectLifecycle: () => ({
    reset: vi.fn(), stop: runtime.stop, restart: vi.fn(), start: runtime.start,
  })
}));
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
beforeEach(() => { vi.resetAllMocks(); runtime.start.mockResolvedValue({ baseUrl: "http://127.0.0.1:9999" }); });
function result(status: WorkflowResult["status"], expectationId = "persists"): WorkflowResult {
  return { status, expectationId, reached: true, assertions: [], steps: [], durationMs: 1, trace: "trace", traces: [], videos: [] };
}
async function fixture(benchmark = false) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-general-verification-"));
  directories.push(directory);
  const app = path.join(directory, "app"); await mkdir(app);
  await writeFile(path.join(app, "main.js"), "old\n");
  const patch = "diff --git a/main.js b/main.js\n--- a/main.js\n+++ b/main.js\n@@ -1 +1 @@\n-old\n+new\n";
  for (const name of ["a.patch", "b.patch", "candidate.patch"]) await writeFile(path.join(directory, name), patch);
  await writeFile(path.join(directory, "report.md"), "A saved change disappears on reopen.");
  await writeFile(path.join(directory, "project.json"), JSON.stringify({
    schemaVersion: 1, id: "general", root: "app", sourceFiles: ["main.js"], runtime: {
      command: [process.execPath, "main.js"], readinessPath: "/ready", portVariable: "PORT", dataVariable: "STATE", restart: true,
    }
  }));
  const definition = {
    schemaVersion: 1, id: "example", projectId: "general", report: "report.md", fixtures: {}, purpose: "fixture",
    expectations: [{ id: "persists", statement: "The change persists", provenance: "developer" }], reproductionTargets: ["persists"],
    mode: benchmark ? "benchmark" : "verification", controls: benchmark ? [{ id: "a", patch: "a.patch" }, { id: "b", patch: "b.patch" }] : []
  };
  await writeFile(path.join(directory, "case.json"), JSON.stringify(definition));
  await writeFile(path.join(directory, "workflow.json"), JSON.stringify({
    schemaVersion: 1, steps: [
      { action: "navigate", path: "/" }, { action: "reached" },
      { action: "capture", locator: { kind: "css", value: "#state" }, kind: "text", capture: "state" },
      { action: "assert", expectationId: "persists", actual: { variable: "state" }, operator: "eq", expected: "saved" },
    ]
  }));
  return {
    directory, options: {
      project: path.join(directory, "project.json"), caseFile: path.join(directory, "case.json"),
      workflow: path.join(directory, "workflow.json"), runsDirectory: path.join(directory, "runs"), confirmation: "fixture" as const,
      candidate: path.join(directory, "candidate.patch")
    }
  };
}
it("evaluates a candidate without prewritten controls and retains missing calibration", async () => {
  const { options } = await fixture();
  vi.mocked(runWorkflow).mockResolvedValueOnce(result("assertion-failed")).mockResolvedValueOnce(result("passed"));
  const { report, reportPath } = await verifyProject(options);
  expect(report.status).toBe("completed"); expect(report.candidate).toBe("passed");
  expect(report.limitations.join(" ")).toContain("false-rejection calibration is unavailable");
  expect(JSON.parse(await readFile(reportPath, "utf8")).checks.sha256).toMatch(/^[a-f0-9]{64}$/);
});
it("blocks a candidate when reproduction fails on an unrelated assertion", async () => {
  const { options } = await fixture();
  vi.mocked(runWorkflow).mockResolvedValue(result("assertion-failed", "unrelated"));
  const { report } = await verifyProject(options);
  expect(report.status).toBe("blocked"); expect(report.candidate).toBeUndefined();
  expect(runWorkflow).toHaveBeenCalledTimes(1);
});
it("requires every supplied benchmark control to pass", async () => {
  const { options } = await fixture(true);
  vi.mocked(runWorkflow).mockResolvedValueOnce(result("assertion-failed")).mockResolvedValueOnce(result("passed"))
    .mockResolvedValueOnce(result("assertion-failed"));
  const { report } = await verifyProject(options);
  expect(report.status).toBe("blocked"); expect(report.variants).toHaveLength(3);
  expect(report.verdict).toContain("correct control"); expect(report.candidate).toBeUndefined();
});
it("does not call an execution failure a rejected repair", async () => {
  const { options } = await fixture();
  vi.mocked(runWorkflow).mockResolvedValueOnce(result("assertion-failed")).mockResolvedValueOnce(result("timeout"));
  const { report } = await verifyProject(options);
  expect(report.status).toBe("error"); expect(report.candidate).toBeUndefined();
});
it("refuses scripted confirmation for a non-fixture case", async () => {
  const { options } = await fixture();
  const definition = JSON.parse(await readFile(options.caseFile, "utf8"));
  definition.purpose = "verification";
  await writeFile(options.caseFile, JSON.stringify(definition));
  await expect(verifyProject(options)).rejects.toThrow("explicitly labelled fixture");
  expect(runWorkflow).not.toHaveBeenCalled();
});

it("records cancellation after an evaluated variant and does not run controls or candidate", async () => {
  const { options } = await fixture(true);
  const controller = new AbortController();
  const phases: string[] = [];
  vi.mocked(runWorkflow).mockImplementationOnce(async () => {
    controller.abort();
    return result("cancelled");
  });
  const { report, reportPath } = await verifyProject({ ...options, signal: controller.signal, onProgress(event) { phases.push(event.phase); } });
  expect(report.status).toBe("cancelled");
  expect(report.candidate).toBeUndefined();
  expect(report.variants).toHaveLength(1);
  expect(runWorkflow).toHaveBeenCalledTimes(1);
  expect(phases).toEqual(["preparing", "frozen", "variant-start", "runtime-ready", "variant-finish", "finished"]);
  expect(JSON.parse(await readFile(reportPath, "utf8")).status).toBe("cancelled");
});


it("stops the lifecycle and writes a cancelled report when readiness is interrupted", async () => {
  const { options } = await fixture(true);
  const controller = new AbortController();
  runtime.start.mockImplementation(async (signal: AbortSignal) => {
    controller.abort();
    if (signal.aborted) throw new Error("Readiness cancelled");
  });
  const { report, reportPath } = await verifyProject({ ...options, signal: controller.signal });
  expect(runtime.stop).toHaveBeenCalled();
  expect(report.status).toBe("cancelled");
  expect(report.candidate).toBeUndefined();
  expect(runWorkflow).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(reportPath, "utf8")).status).toBe("cancelled");
});

it("reports unsuccessful lifecycle cleanup after cancellation without a candidate verdict", async () => {
  const { options } = await fixture();
  const controller = new AbortController();
  const outcomes: string[] = [];
  runtime.stop.mockRejectedValue(new Error("stop failed"));
  vi.mocked(runWorkflow).mockImplementationOnce(async () => { controller.abort(); return result("cancelled"); });
  const { report } = await verifyProject({ ...options, signal: controller.signal, onProgress(event) {
    if (event.phase === "variant-finish") outcomes.push(event.outcome ?? "");
  } });
  expect(report.status).toBe("cancelled");
  expect(report.cleanupComplete).toBe(false);
  expect(report.variants[0]?.cleanupComplete).toBe(false);
  expect(report.variants[0]?.error).toContain("stop failed");
  expect(report.candidate).toBeUndefined();
  expect(outcomes).toEqual(["error"]);
});

it("does not start controls or a candidate after original cleanup fails", async () => {
  const { options } = await fixture(true);
  runtime.stop.mockRejectedValue(new Error("stop failed"));
  vi.mocked(runWorkflow).mockResolvedValue(result("assertion-failed"));
  const { report } = await verifyProject(options);
  expect(report.status).toBe("error");
  expect(report.cleanupComplete).toBe(false);
  expect(report.variants).toHaveLength(1);
  expect(runtime.start).toHaveBeenCalledTimes(1);
  expect(runWorkflow).toHaveBeenCalledTimes(1);
  expect(report.candidate).toBeUndefined();
});

it("does not start later controls or a candidate after a control cleanup fails", async () => {
  const { options } = await fixture(true);
  runtime.stop.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("stop failed"));
  vi.mocked(runWorkflow).mockResolvedValueOnce(result("assertion-failed")).mockResolvedValue(result("passed"));
  const { report } = await verifyProject(options);
  expect(report.status).toBe("error");
  expect(report.cleanupComplete).toBe(false);
  expect(report.variants).toHaveLength(2);
  expect(runtime.start).toHaveBeenCalledTimes(2);
  expect(report.candidate).toBeUndefined();
});

it("clears the candidate verdict when its workflow cleanup fails", async () => {
  const { options } = await fixture();
  vi.mocked(runWorkflow).mockResolvedValueOnce(result("assertion-failed"))
    .mockResolvedValueOnce({ ...result("passed"), cleanupComplete: false });
  const { report } = await verifyProject(options);
  expect(report.status).toBe("error");
  expect(report.cleanupComplete).toBe(false);
  expect(report.candidate).toBeUndefined();
});
