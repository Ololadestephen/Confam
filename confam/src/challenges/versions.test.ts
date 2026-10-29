import { describe, expect, it, vi } from "vitest";
import { evaluateVersions, type VersionOptions, type WorkflowVersion } from "./versions.js";
import type { WorkflowPlan } from "../workflows/schema.js";

const initial: WorkflowPlan = {
  schemaVersion: 1, steps: [
    { action: "navigate", path: "/" }, { action: "reached" },
    { action: "capture", locator: { kind: "css", value: "#saved" }, kind: "count", capture: "saved" },
    { action: "assert", expectationId: "persists", actual: { variable: "saved" }, operator: "eq", expected: 1 },
  ]
};
const survivor = { id: "memory-only", violation: "State is not durable", patch: "fixture diff", observations: { durable: { holds: false } } };
function fixture(): VersionOptions {
  return {
    initial: structuredClone(initial),
    evaluate: vi.fn(async () => ({ gatePassed: true, survivors: [structuredClone(survivor)], results: { original: "reproduced", controls: ["passed", "passed"] } })),
    strengthen: vi.fn(async ({ plan }) => ({ plan: { ...plan, steps: [...plan.steps, { action: "reload" }] }, reason: "Additional observation", reviewReasons: [] })),
  };
}

describe("generic workflow strengthening", () => {
  it("does not invent a round when there are no qualified survivors", async () => {
    const options = fixture();
    options.evaluate = vi.fn(async () => ({ gatePassed: true, survivors: [], results: {} }));
    const result = await evaluateVersions(options);
    expect(result.reason).toBe("no-survivors"); expect(result.rounds).toBe(0);
    expect(result.versions).toHaveLength(1); expect(options.strengthen).not.toHaveBeenCalled();
  });

  it("evaluates at most three versions and rechecks the gate after both rounds", async () => {
    const options = fixture();
    const preserved: WorkflowVersion[] = [];
    options.preserve = async (record) => { preserved.push(record); };
    const result = await evaluateVersions(options);
    expect(result.reason).toBe("round-limit"); expect(result.rounds).toBe(2);
    expect(result.versions.map(({ version }) => version)).toEqual([1, 2, 3]);
    expect(options.evaluate).toHaveBeenCalledTimes(3); expect(options.strengthen).toHaveBeenCalledTimes(2);
    expect(JSON.parse(JSON.stringify(preserved))).toEqual(result.versions);
  });

  it("stops when an original or control gate fails on a later version", async () => {
    const options = fixture();
    options.evaluate = vi.fn(async (_plan, version) => ({ gatePassed: version === 1, survivors: [survivor], results: {} }));
    const result = await evaluateVersions(options);
    expect(result.status).toBe("blocked"); expect(result.reason).toBe("control-or-reproduction-gate");
    expect(result.versions).toHaveLength(2); expect(options.strengthen).toHaveBeenCalledTimes(1);
  });

  it("stops immediately at the first failed gate", async () => {
    const options = fixture();
    options.evaluate = vi.fn(async () => ({ gatePassed: false, survivors: [survivor], results: {} }));
    const result = await evaluateVersions(options);
    expect(result.status).toBe("blocked"); expect(result.rounds).toBe(0);
    expect(options.strengthen).not.toHaveBeenCalled();
  });

  it("keeps plans, survivor evidence, and history independent of callback mutation", async () => {
    const options = fixture();
    options.evaluate = vi.fn(async (plan) => {
      plan.steps.length = 0;
      return { gatePassed: true, survivors: [structuredClone(survivor)], results: {} };
    });
    options.preserve = async (record) => { record.plan.steps.length = 0; record.survivors.length = 0; };
    options.strengthen = vi.fn(async (request) => {
      request.survivors[0]!.violation = "tampered";
      return { plan: request.plan, reason: "No useful change", reviewReasons: [] };
    });
    const result = await evaluateVersions(options);
    expect(result.reason).toBe("verifier-no-change");
    expect(result.versions[0]?.plan).toEqual(initial);
    expect(result.versions[0]?.survivors[0]?.violation).toBe(survivor.violation);
    expect(options.initial).toEqual(initial);
  });

  it("requires review if an existing action/assertion is changed", async () => {
    const options = fixture();
    options.strengthen = async ({ plan }) => {
      plan.steps[0] = { action: "navigate", path: "/different" };
      return { plan, reason: "Changed trigger", reviewReasons: [] };
    };
    const result = await evaluateVersions(options);
    expect(result.status).toBe("needs-review"); expect(result.versions).toHaveLength(1);
    expect(result.reviewReasons?.join(" ")).toContain("altered");
  });

  it("requires review for a new expectation ID and preserves the proposal separately", async () => {
    const options = fixture();
    options.strengthen = async ({ plan }) => ({
      plan: { ...plan, steps: [...plan.steps, { action: "assert", expectationId: "newRequirement", actual: { variable: "saved" }, operator: "eq", expected: 1 }] },
      reason: "New requirement", reviewReasons: [],
    });
    options.proposal = vi.fn(async (_round, proposal) => { proposal.reviewReasons.length = 0; });
    const result = await evaluateVersions(options);
    expect(result.status).toBe("needs-review"); expect(result.reviewReasons?.join(" ")).toContain("unconfirmed");
    expect(options.proposal).toHaveBeenCalledOnce();
  });

  it("records schema-invalid proposals for review without evaluating them", async () => {
    const options = fixture();
    options.strengthen = async () => ({ plan: { schemaVersion: 1, steps: [{ action: "eval", code: "bad" }] }, reason: "Unsupported", reviewReasons: [] });
    options.proposal = vi.fn();
    const result = await evaluateVersions(options);
    expect(result.status).toBe("needs-review"); expect(result.reason).toBe("invalid-proposal");
    expect(options.evaluate).toHaveBeenCalledTimes(1);
    expect(options.proposal).toHaveBeenCalledWith(1, expect.objectContaining({ valid: false, original: expect.any(Object) }));
  });

  it("preserves an explicit verifier review stop and reports unavailable strengthening", async () => {
    const options = fixture();
    options.strengthen = async ({ plan }) => ({ plan, reason: "Ambiguous", reviewReasons: ["Owner clarification needed"] });
    expect((await evaluateVersions(options)).status).toBe("needs-review");
    delete options.strengthen;
    expect((await evaluateVersions(options)).reason).toBe("strengthening-unavailable");
  });
});
