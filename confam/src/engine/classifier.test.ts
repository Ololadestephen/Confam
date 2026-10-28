import { describe, expect, it } from "vitest";
import { classifyDecoy } from "./classifier.js";
import type { CheckResult } from "./contracts.js";

const checks: CheckResult = {
  status: "assertion-failed", reached: true, assertions: [], steps: [], durationMs: 1, trace: "trace.zip", videos: [],
};
const requirements = [{ probe: "saved", holds: false }];

describe("decoy classification", () => {
  it("counts caught and survived only after oracle confirmation", () => {
    const observations = { saved: { holds: false, observed: { rows: [] } } };
    expect(classifyDecoy(checks, requirements, observations)).toBe("caught");
    expect(classifyDecoy({ ...checks, status: "passed" }, requirements, observations)).toBe("survived");
    expect(classifyDecoy(checks, requirements, {})).toBe("unconfirmed");
    expect(classifyDecoy(checks, [], observations)).toBe("unconfirmed");
    expect(classifyDecoy(checks, requirements, { saved: { holds: true, observed: {} } })).toBe("unconfirmed");
  });

  it.each(["unreached", "execution-error", "timeout"] as const)("does not count %s as caught", (status) => {
    expect(classifyDecoy({ ...checks, status }, requirements, {})).toBe(status);
  });

  it("requires both existence and wrong ownership for a wrong-owner violation", () => {
    const wrongOwner = [{ probe: "saved", holds: true }, { probe: "owned", holds: false }];
    const observations = { saved: { holds: false, observed: {} }, owned: { holds: false, observed: {} } };
    expect(classifyDecoy(checks, wrongOwner, observations)).toBe("unconfirmed");
    observations.saved.holds = true;
    expect(classifyDecoy(checks, wrongOwner, observations)).toBe("caught");
  });
});
