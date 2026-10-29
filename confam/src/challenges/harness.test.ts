import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { challengeProject } from "./harness.js";
import { evaluateChallengePack } from "./evaluate-pack.js";

vi.mock("../project/verify.js", async (original) => {
  const actual = await original<typeof import("../project/verify.js")>();
  return {
    ...actual, evaluate: vi.fn(async (run, id, kind) => {
      const comparator = run.directory.includes("direct-ai");
      const failed = id === "original" || (comparator ? kind === "control" : id.startsWith("decoy-"));
      return {
        id, kind, phase: "probes", probes: run.probes?.length ? { saved: { holds: kind === "control", observed: kind === "control" } } : undefined,
        result: { status: failed ? "assertion-failed" : "passed", reached: true, expectationId: "persists", assertions: [], steps: [], durationMs: 1, trace: "trace", traces: [], videos: [] }
      };
    })
  };
});
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture(confirmation: "fixture" | "developer-cli" = "fixture") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-challenge-")); directories.push(directory);
  await mkdir(path.join(directory, "app")); await writeFile(path.join(directory, "app/main.js"), "old\n");
  await writeFile(path.join(directory, "project.json"), JSON.stringify({
    schemaVersion: 1, id: "example", root: "app", sourceFiles: ["main.js"], runtime: {
      command: [process.execPath, "main.js"], readinessPath: "/ready", portVariable: "PORT", dataVariable: "STATE", restart: true
    }
  }));
  const definition = {
    schemaVersion: 1, id: "case", projectId: "example", report: "report.md", fixtures: {}, purpose: "fixture", mode: "benchmark",
    expectations: [{ id: "persists", statement: "The state persists", provenance: "developer" }], reproductionTargets: ["persists"],
    controls: [{ id: "a", patch: "a.patch" }, { id: "b", patch: "b.patch" }]
  };
  await writeFile(path.join(directory, "case.json"), JSON.stringify(definition)); await writeFile(path.join(directory, "report.md"), "The saved state disappears.");
  for (const file of ["a.patch", "b.patch", "fault.patch"]) await writeFile(path.join(directory, file), "test patch content; runner mocked");
  const plan = {
    schemaVersion: 1, steps: [{ action: "navigate", path: "/" }, { action: "reached" },
    { action: "capture", locator: { kind: "css", value: "#state" }, kind: "text", capture: "saved" },
    { action: "assert", expectationId: "persists", actual: { variable: "saved" }, expected: "yes", operator: "eq" }]
  };
  await writeFile(path.join(directory, "workflow.json"), JSON.stringify(plan));
  const decoy = { id: "missingSave", baseControl: "a", patch: "fault.patch", violation: "A write is omitted", expectationIds: ["persists"], requirements: [{ probe: "saved", holds: false }] };
  await writeFile(path.join(directory, "challenges.json"), JSON.stringify({
    schemaVersion: 1, purpose: "development",
    probes: [{ id: "saved", kind: "json-file", path: "state", pointer: ["saved"], expected: true }], decoys: [decoy],
    comparators: [{ role: "direct-ai", workflow: "workflow.json", provenance: "SYNTHETIC unit-test comparator, not evidence of model performance." }]
  }));
  await writeFile(path.join(directory, "pack.json"), JSON.stringify({ schemaVersion: 1, purpose: "integration-fixture", label: "Known-fault integration fixture", decoys: [decoy] }));
  const result = await challengeProject({ project: path.join(directory, "project.json"), caseFile: path.join(directory, "case.json"), workflow: path.join(directory, "workflow.json"), manifest: path.join(directory, "challenges.json"), runsDirectory: path.join(directory, "runs"), confirmation });
  return { directory, result, run: path.dirname(result.reportPath), pack: path.join(directory, "pack.json") };
}
it("seals development results without inventing independent evaluation", async () => {
  const { result } = await fixture();
  expect(result.report.status).toBe("completed");
  expect(result.report.development).toEqual({ total: 1, caught: 1, survived: 0, uncounted: 0 });
  expect(result.report.independentEvaluation).toEqual({ evaluated: false });
  expect(result.report.absentComparators).toEqual(["existing"]);
});
it("retains a falsely rejecting comparator and scores all arms against shared fault labels", async () => {
  const { run, pack } = await fixture();
  const evaluation = await evaluateChallengePack(run, pack, true);
  expect(evaluation.report.status).toBe("completed");
  const arms = evaluation.report.arms as { role: string; falseRejections: number; counts: { survived: number; caught: number } }[];
  expect(arms.find(({ role }) => role === "direct-ai")).toMatchObject({ falseRejections: 2, counts: { survived: 1 } });
  expect(arms.find(({ role }) => role === "confam-final")).toMatchObject({ falseRejections: 0, counts: { caught: 1 } });
  expect(JSON.parse(await readFile(path.join(run, "challenge-report.json"), "utf8")).independentEvaluation).toEqual({ evaluated: false });
});
it("rejects modified final inputs before opening an independent pack", async () => {
  const { run } = await fixture();
  await writeFile(path.join(run, "seal/probes.json"), "[]");
  await expect(evaluateChallengePack(run, "/nonexistent-private-pack", true)).rejects.toThrow("hash mismatch");
});
it("does not promote scripted fixture runs to genuine held-out evaluation", async () => {
  const { run, pack } = await fixture();
  await expect(evaluateChallengePack(run, pack)).rejects.toThrow("Scripted fixture");
});

it("uses sealed confirmation rather than mutable report metadata", async () => {
  const { run, pack } = await fixture();
  const file = path.join(run, "challenge-report.json");
  const report = JSON.parse(await readFile(file, "utf8"));
  report.confirmation = "developer-cli";
  await writeFile(file, JSON.stringify(report));
  await expect(evaluateChallengePack(run, pack)).rejects.toThrow("sealed confirmation");
});
it("permits only one genuine evaluation attempt for a frozen run", async () => {
  // Synthetic labels/mocked runner exercise the one-attempt protocol, not held-out performance.
  const { run, pack } = await fixture("developer-cli");
  const contents = JSON.parse(await readFile(pack, "utf8")); contents.purpose = "held-out";
  await writeFile(pack, JSON.stringify(contents));
  const result = await evaluateChallengePack(run, pack);
  expect(result.report.status).toBe("completed");
  await expect(evaluateChallengePack(run, pack)).rejects.toMatchObject({ code: "EEXIST" });
});
