import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { modelStrengthener } from "./challenge.js";
import type { ModelTransport } from "../models/client.js";
import type { WorkflowPlan } from "../workflows/schema.js";
const plan: WorkflowPlan = {
  schemaVersion: 1, steps: [{ action: "navigate", path: "/" }, { action: "reached" },
  { action: "capture", locator: { kind: "css", value: "#state" }, kind: "text", capture: "state" },
  { action: "assert", expectationId: "saved", actual: { variable: "state" }, operator: "eq", expected: "yes" }]
};
it("uses a lazy shared-budget verifier with survivor-only input", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-verifier-"));
  try {
    let sent = "";
    const transport: ModelTransport = {
      mode: "fixture", count: async () => 100, generate: async (request) => {
        sent = request.input;
        expect(request.stage).toBe("strengthen");
        return { text: JSON.stringify({ plan, reason: "No supported improvement", reviewReasons: [] }), completed: true, usage: { input: 100, output: 100, cached: 0 } };
      }
    };
    const verifier = modelStrengthener(directory, 0.25, transport);
    await expect(readFile(path.join(directory, "model-usage.json"))).rejects.toThrow();
    await verifier.strengthen({ round: 1, plan, survivors: [{ id: "survivor", violation: "Missing state", patch: "survivor patch", observations: { saved: false } }] });
    expect(sent).toContain("survivor patch");
    expect(Object.keys(JSON.parse(sent))).toEqual(["round", "plan", "survivors"]);
    expect(verifier.usage().estimatedSpendUsd).toBe(0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it("stops before generation when the verifier budget cannot cover it", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-verifier-cap-"));
  try {
    let generated = false;
    const transport: ModelTransport = { mode: "fixture", count: async () => 100, generate: async () => { generated = true; throw new Error("must not generate"); } };
    const verifier = modelStrengthener(directory, 0.00000001, transport);
    await expect(verifier.strengthen({ round: 1, plan, survivors: [] })).rejects.toThrow("budget");
    expect(generated).toBe(false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it("decodes the Meta wire format returned by the verifier into a native workflow", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-verifier-wire-"));
  try {
    const wire = {
      schemaVersion: 1, steps: [
        { action: "navigate", path: "/" },
        { action: "click", locator: { kind: "role", value: "button", name: null } },
        { action: "select", locator: { kind: "label", value: "Time" }, value: "2:00 PM", by: null },
        { action: "reached" },
      ]
    };
    const transport: ModelTransport = {
      mode: "fixture", count: async () => 100,
      generate: async () => ({ text: JSON.stringify({ plan: wire, reason: "Appended nothing", reviewReasons: [] }), completed: true, usage: { input: 100, output: 100, cached: 0 } }),
    };
    const proposal = await modelStrengthener(directory, 0.25, transport).strengthen({ round: 1, plan, survivors: [] });
    expect(proposal.plan).toEqual({
      schemaVersion: 1, steps: [
        { action: "navigate", path: "/" },
        { action: "click", locator: { kind: "role", value: "button" } },
        { action: "select", locator: { kind: "label", value: "Time" }, value: "2:00 PM" },
        { action: "reached" },
      ]
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
