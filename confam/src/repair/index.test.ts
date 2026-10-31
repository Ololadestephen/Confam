import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { continueRepair, readRepair, recheckRepair, startRepair } from "./index.js";
import { verifyProject } from "../project/verify.js";
import type { ModelTransport } from "../models/client.js";

vi.mock("../project/verify.js", () => ({ verifyProject: vi.fn() }));
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
beforeEach(() => vi.resetAllMocks());

async function fixture() {
  const directory = await mkdtemp(path.join(realpathSync(tmpdir()), "confam-repair-")); directories.push(directory);
  await mkdir(path.join(directory, "app"));
  await writeFile(path.join(directory, "app", "main.js"), "one\ntwo\nthree\n");
  await writeFile(path.join(directory, "project.json"), JSON.stringify({
    schemaVersion: 1, id: "sample", root: "app", sourceFiles: ["main.js"],
    runtime: { command: ["node", "main.js"], readinessPath: "/ready", portVariable: "PORT", dataVariable: "STATE", restart: false },
  }));
  for (const [id, statement] of [["gap", "Saved state survives reopening"], ["guard", "The page still loads"]]) {
    await writeFile(path.join(directory, `report-${id}.md`), `Report for ${id}.`);
    await writeFile(path.join(directory, `case-${id}.json`), JSON.stringify({
      schemaVersion: 1, id, projectId: "sample", report: `report-${id}.md`, fixtures: {},
      expectations: [{ id, statement, provenance: "developer" }], reproductionTargets: [id], mode: "verification", purpose: "verification", controls: [],
    }));
    await writeFile(path.join(directory, `workflow-${id}.json`), "{}");
  }
  await writeFile(path.join(directory, "suite.json"), JSON.stringify({
    schemaVersion: 1, project: "project.json",
    cases: [{ case: "case-gap.json", workflow: "workflow-gap.json" }, { case: "case-guard.json", workflow: "workflow-guard.json" }],
  }));
  return directory;
}
const patch = (line: string) => `--- a/main.js\n+++ b/main.js\n@@ -1,3 +1,4 @@\n one\n two\n+${line}\n three\n`;
function transport(replies: object[], seen: string[] = []): ModelTransport {
  return {
    mode: "fixture", count: async () => 100, generate: async (request) => {
      seen.push(request.input);
      return { completed: true, usage: { input: 100, output: 100, cached: 0 }, text: JSON.stringify(replies.shift()) };
    },
  };
}
// A reproducing case gets a candidate verdict; the guard case already passes on the original.
function verification(candidate: "passed" | "failed" | undefined, unmet: string[] = []) {
  return {
    reportPath: "/runs/verify-x/verification.json",
    report: {
      candidate, verdict: "v", variants: [
        { id: "original", kind: "original", result: { status: candidate ? "assertion-failed" : "passed", assertions: [] } },
        ...(candidate ? [{ id: "candidate", kind: "candidate", result: { status: candidate, assertions: unmet.map((expectationId) => ({ expectationId, passed: false })) } }] : []),
      ],
    },
  } as never;
}
const regression = (status: "passed" | "assertion-failed", unmet: string[] = []) => ({
  reportPath: "/runs/verify-y/verification.json",
  report: { verdict: "v", variants: [{ id: "original", kind: "original", result: { status, assertions: unmet.map((expectationId) => ({ expectationId, passed: false })) } }] },
}) as never;

it("waits for approval before each model call, then reviews a passing fix with Muse Spark", async () => {
  const directory = await fixture();
  const runs = path.join(directory, "runs");
  const { sessionDirectory, state } = await startRepair(path.join(directory, "suite.json"), runs);
  expect(state.pending?.stage).toBe("fixer");
  const exported = JSON.parse(await readFile(state.pending!.exportPath, "utf8"));
  expect(exported.input.expectations.map(({ id }: { id: string }) => id)).toEqual(["gap", "guard"]);
  await writeFile(path.join(directory, "other.json"), "{}");
  await expect(continueRepair(sessionDirectory, path.join(directory, "other.json"), { transport: transport([]) })).rejects.toThrow("not the pending export");

  vi.mocked(verifyProject).mockResolvedValueOnce(verification("passed")).mockResolvedValueOnce(verification(undefined)).mockResolvedValueOnce(regression("passed"));
  const afterFix = await continueRepair(sessionDirectory, state.pending!.exportPath, { transport: transport([{ patch: patch("saved") }]) });
  expect(afterFix.rounds[0]!.results.map(({ outcome, mode }) => [outcome, mode])).toEqual([["passed", "candidate"], ["passed", "regression"]]);
  expect(afterFix.pending?.stage).toBe("gaps");
  expect(path.dirname(path.dirname(afterFix.pending!.exportPath))).toBe(runs);

  const seen: string[] = [];
  const done = await continueRepair(sessionDirectory, afterFix.pending!.exportPath, { transport: transport([{ gaps: [] }], seen) });
  expect(JSON.parse(seen[0]!).proposedFix).toContain("+saved");
  expect(done.outcome).toBe("repaired-and-reviewed");
  expect(done.review?.proposalPath).toContain(path.join(runs, "draft-gaps-"));
  expect((await readRepair(sessionDirectory)).status).toBe("finished");
});

it("gives Wonder one more attempt with only the unmet expectation statements, then stops", async () => {
  const directory = await fixture();
  const { sessionDirectory, state } = await startRepair(path.join(directory, "suite.json"), path.join(directory, "runs"));
  vi.mocked(verifyProject)
    .mockResolvedValueOnce(verification("failed", ["gap"])).mockResolvedValueOnce(verification(undefined)).mockResolvedValueOnce(regression("passed"))
    .mockResolvedValueOnce(verification("failed", ["gap"])).mockResolvedValueOnce(verification(undefined)).mockResolvedValueOnce(regression("assertion-failed", ["guard"]));
  const second = await continueRepair(sessionDirectory, state.pending!.exportPath, { transport: transport([{ patch: patch("first") }]) });
  expect(second.pending).toMatchObject({ stage: "fixer", round: 2 });
  const exported = JSON.parse(await readFile(second.pending!.exportPath, "utf8"));
  expect(exported.input.previousAttempt.unmetExpectations).toEqual([{ id: "gap", statement: "Saved state survives reopening" }]);
  expect(exported.input.previousAttempt.previousPatch).toContain("+first");
  expect(JSON.stringify(exported)).not.toContain("assertion");

  const final = await continueRepair(sessionDirectory, second.pending!.exportPath, { transport: transport([{ patch: patch("second") }]) });
  expect(final.rounds[1]!.results.map(({ unmet }) => unmet)).toEqual([["gap"], ["guard"]]);
  expect(final).toMatchObject({ status: "finished", outcome: "not-repaired", pending: null });
});

it("stops as incomplete instead of feeding an execution error back to the fixer", async () => {
  const directory = await fixture();
  const { sessionDirectory, state } = await startRepair(path.join(directory, "suite.json"), path.join(directory, "runs"));
  vi.mocked(verifyProject).mockRejectedValueOnce(new Error("app did not start")).mockResolvedValueOnce(verification(undefined)).mockResolvedValueOnce(regression("passed"));
  const result = await continueRepair(sessionDirectory, state.pending!.exportPath, { transport: transport([{ patch: patch("saved") }]) });
  expect(result).toMatchObject({ status: "finished", outcome: "incomplete", pending: null });
  expect(result.rounds[0]!.results[0]).toMatchObject({ outcome: "incomplete", error: "app did not start" });
});

it("rechecks the last fix after an execution error without a model call, on a clean patched copy", async () => {
  const directory = await fixture();
  const { sessionDirectory, state } = await startRepair(path.join(directory, "suite.json"), path.join(directory, "runs"));
  vi.mocked(verifyProject).mockResolvedValueOnce(verification("passed")).mockRejectedValueOnce(new Error("busy port"));
  const stopped = await continueRepair(sessionDirectory, state.pending!.exportPath, { transport: transport([{ patch: patch("saved") }]) });
  expect(stopped.outcome).toBe("incomplete");
  let patchedProject = "";
  vi.mocked(verifyProject).mockResolvedValueOnce(verification("passed")).mockResolvedValueOnce(verification(undefined))
    .mockImplementationOnce(async (options) => { patchedProject = options.project; return regression("passed"); });
  const rechecked = await recheckRepair(sessionDirectory);
  expect(rechecked.rounds).toHaveLength(1);
  expect(rechecked.rounds[0]!.earlierResults).toHaveLength(1);
  expect(rechecked.pending?.stage).toBe("gaps");
  const root = path.join(path.dirname(patchedProject), "baseline");
  expect(await readFile(path.join(root, "main.js"), "utf8")).toContain("saved");
  await expect(access(path.join(root, ".confam-project.json"))).rejects.toThrow();
  await expect(access(path.join(root, ".git"))).rejects.toThrow();
});

it("records a reply that is not a usable patch and keeps waiting on the same approval", async () => {
  const directory = await fixture();
  const { sessionDirectory, state } = await startRepair(path.join(directory, "suite.json"), path.join(directory, "runs"));
  const bad = "--- a/main.js\n+++ b/main.js\n@@ -1,3 +1,3 @@\n missing\n-context\n+here\n";
  await expect(continueRepair(sessionDirectory, state.pending!.exportPath, { transport: transport([{ patch: bad }]) })).rejects.toThrow();
  const saved = await readRepair(sessionDirectory);
  expect(saved.attempts).toHaveLength(1);
  expect(saved).toMatchObject({ status: "awaiting-approval", rounds: [], pending: { stage: "fixer", round: 1 } });
});
