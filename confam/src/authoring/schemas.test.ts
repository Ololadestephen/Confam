import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readJson } from "../engine/json.js";
import { checkPlanSchema, decoyDraftSchema, intakeSchema, validateCheckPlan, validateDecoyDraft, validateIntake } from "./schemas.js";

const fixture = (name: string) => readJson(fileURLToPath(new URL(`../../fixtures/day3/${name}.json`, import.meta.url)));
describe("authoring trust contracts", () => {
  it("cannot add, weaken, duplicate or omit a confirmed expectation", async () => {
    const draft = intakeSchema.parse(await fixture("intake"));
    validateIntake(draft);
    const plan = checkPlanSchema.parse(await fixture("checks"));
    expect(() => validateCheckPlan(plan, draft.expectations)).toThrow();
    const confirmed = [...draft.expectations, draft.question!.proposedExpectation];
    expect(validateCheckPlan(plan, confirmed).assertions.map(({ expectationId }) => expectationId)).toEqual(["E2", "E1", "E3", "E4"]);
    const weakened = structuredClone(plan);
    weakened.assertions[0]!.expectedCount = 0;
    expect(() => validateCheckPlan(weakened, confirmed)).toThrow("changes or omits");
    const duplicate = structuredClone(plan);
    duplicate.assertions[1] = duplicate.assertions[0]!;
    expect(() => validateCheckPlan(duplicate, confirmed)).toThrow("exactly once");
  });

  it("requires both saved-row and wrong-owner evidence for T3", async () => {
    const draft = decoyDraftSchema.parse(await fixture("decoys"));
    validateDecoyDraft(draft);
    draft.decoys.find(({ category }) => category === "T3")!.requirements.shift();
    expect(() => validateDecoyDraft(draft)).toThrow("requirements");
  });

  it("rejects synthetic T4 error logs instead of counting them as failed inserts", async () => {
    const draft = decoyDraftSchema.parse(await fixture("decoys"));
    draft.decoys.find(({ category }) => category === "T4")!.edits = [{ file: "server.js", before: "db.addAppointment(appointment);", after: "console.error('Could not save appointment: synthetic');" }];
    expect(() => validateDecoyDraft(draft)).toThrow("curated failing-insert");
  });

  it("rejects protected source files and made-up probes at the response boundary", async () => {
    const draft = await fixture("decoys") as { decoys: { edits: { file: string; }[]; requirements: { probe: string; }[]; }[]; };
    draft.decoys[0]!.edits[0]!.file = "../checks.ts";
    expect(decoyDraftSchema.safeParse(draft).success).toBe(false);
    draft.decoys[0]!.edits[0]!.file = "server.js";
    draft.decoys[0]!.requirements[0]!.probe = "invented-probe";
    expect(decoyDraftSchema.safeParse(draft).success).toBe(false);
  });
});
