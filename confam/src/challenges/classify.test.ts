import { expect, it } from "vitest";
import { classifyChallenge, countChallenges } from "./classify.js";
import type { Decoy } from "./schema.js";
import type { EvaluatedVariant } from "../project/verify.js";
const decoy: Decoy = { id: "fault", baseControl: "good", patch: "fault.patch", violation: "Wrong saved state", expectationIds: ["persists"], requirements: [{ probe: "saved", holds: false }] };
function variant(status: "passed" | "assertion-failed" | "timeout", expectationId = "persists"): EvaluatedVariant {
  return {
    id: "fault", kind: "candidate", phase: "probes", probes: { saved: { holds: false, observed: false } },
    result: { status, reached: true, expectationId, assertions: [], steps: [], durationMs: 1, trace: "trace", traces: [], videos: [] }
  };
}
it("counts only independently confirmed faults caught by their mapped assertion", () => {
  expect(classifyChallenge(decoy, variant("assertion-failed"))).toBe("caught");
  expect(classifyChallenge(decoy, variant("assertion-failed", "unrelated"))).toBe("unrelated-assertion");
  expect(classifyChallenge(decoy, variant("passed"))).toBe("survived");
  expect(classifyChallenge(decoy, variant("timeout"))).toBe("timeout");
});
it("never treats a failed observation as a confirmed negative", () => {
  const value = variant("assertion-failed");
  value.probes = { saved: { holds: false, observed: null, error: "unavailable" } };
  expect(classifyChallenge(decoy, value)).toBe("unconfirmed");
  expect(classifyChallenge(decoy, { ...value, phase: "prepare", error: "startup" })).toBe("invalid");
});
it("keeps all uncounted outcomes outside caught/survived raw counts", () => {
  expect(countChallenges([{ outcome: "caught" }, { outcome: "unconfirmed" }, { outcome: "unrelated-assertion" }])).toEqual({ total: 3, caught: 1, survived: 0, uncounted: 2 });
});
