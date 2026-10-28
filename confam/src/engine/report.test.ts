import { describe, expect, it } from "vitest";
import { clientVerdict, evidenceSummary } from "./report.js";
import type { RunReport } from "./pipeline.js";

function report(): RunReport {
  return { schemaVersion: 1, id: "synthetic", case: "synthetic", startedAt: "now", status: "completed", stage: "finished", checkVersions: [], variants: [{ id: "candidate", kind: "candidate", outcome: "passed", requirements: [], probes: {} }], development: { caught: 3, survived: 0, uncounted: 0, total: 3 }, heldOut: { evaluated: false }, verdict: "Checks completed.", limitations: ["Only one tested condition."] };
}
describe("client and developer reports", () => {
  it("keeps a passing candidate provisional before independent evaluation", () => {
    expect(clientVerdict(report()).state).toBe("provisional");
    expect(evidenceSummary(report())).toContain("Held-out decoys have not been evaluated");
  });
  it("never reports holds when a decoy survived or a candidate failed", () => {
    const survivor = report();
    survivor.development = { caught: 2, survived: 1, uncounted: 0, total: 3 };
    expect(clientVerdict(survivor).state).toBe("checks-not-strong-enough");
    const failed = report();
    failed.variants[0]!.outcome = "caught";
    expect(clientVerdict(failed).state).toBe("does-not-hold");
  });
  it("requires counted held-out results before reporting holds", () => {
    const completed = report();
    completed.heldOut = { evaluated: true, caught: 2, survived: 0, uncounted: 0, total: 2, reportPath: "synthetic" };
    expect(clientVerdict(completed).state).toBe("holds");
    completed.heldOut.uncounted = 1;
    expect(clientVerdict(completed).state).toBe("provisional");
  });
});
