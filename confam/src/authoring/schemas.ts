import { z } from "zod";

export const BEHAVIORS = {
  E1: "after-reopen", E2: "other-customer", E3: "after-confirmation", E4: "after-restart",
} as const;
export const expectationSchema = z.strictObject({
  id: z.enum(["E1", "E2", "E3", "E4"]),
  behavior: z.enum(["after-reopen", "other-customer", "after-confirmation", "after-restart"]),
  text: z.string().min(1).max(1000),
});
export const intakeSchema = z.strictObject({
  steps: z.array(z.string().min(1).max(1000)).min(1).max(12),
  expectations: z.array(expectationSchema).min(2).max(4),
  question: z.strictObject({ text: z.string().min(1).max(1000), proposedExpectation: expectationSchema }).nullable(),
});
export type IntakeDraft = z.infer<typeof intakeSchema>;
export type Expectation = z.infer<typeof expectationSchema>;

export const checkPlanSchema = z.strictObject({
  assertions: z.array(z.strictObject({
    expectationId: z.enum(["E1", "E2", "E3", "E4"]),
    observation: z.enum(["after-reopen", "other-customer", "after-confirmation", "after-restart", "fresh-sign-in", "other-customer-reopen"]),
    expectedCount: z.number().int().min(0).max(1),
    message: z.string().min(1).max(1000),
  })).min(2).max(12),
});
export type CheckPlan = z.infer<typeof checkPlanSchema>;

export const strengtheningSchema = z.strictObject({
  plan: checkPlanSchema,
  reason: z.string().min(1).max(2000),
  expectationChanges: z.array(z.string().min(1).max(1000)).max(12),
});
export const fixerSchema = z.strictObject({ patch: z.string().min(1).max(60000) });

export const APP_FILES = ["server.js", "db.js", "public/app.js", "public/index.html", "public/styles.css"] as const;
export const decoyDraftSchema = z.strictObject({
  decoys: z.array(z.strictObject({
    category: z.enum(["T1", "T3", "T4"]),
    violation: z.string().min(1).max(1000),
    requirements: z.array(z.strictObject({
      probe: z.enum(["appointment-saved", "appointment-owned-by-customer"]), holds: z.boolean(),
    })).min(1).max(2),
    edits: z.array(z.strictObject({ file: z.enum(APP_FILES), before: z.string().min(1).max(20000), after: z.string().max(20000) })).max(6),
  })).length(3),
});
export type DecoyDraft = z.infer<typeof decoyDraftSchema>;

export function validateExpectations(expectations: Expectation[]): void {
  const ids = expectations.map(({ id }) => id);
  if (new Set(ids).size !== ids.length || !ids.includes("E1") || !ids.includes("E2")) {
    throw new Error("The salon slice requires unique E1 and E2 expectations.");
  }
  for (const expectation of expectations) {
    if (BEHAVIORS[expectation.id] !== expectation.behavior) throw new Error("Expectation ID and supported behavior do not agree.");
  }
}

export function validateIntake(draft: IntakeDraft): void {
  validateExpectations(draft.expectations);
  if (draft.question) {
    const proposed = draft.question.proposedExpectation;
    if (BEHAVIORS[proposed.id] !== proposed.behavior || draft.expectations.some(({ id }) => id === proposed.id)) {
      throw new Error("Clarifying question must propose one additional supported expectation.");
    }
  }
}

export function validateCheckPlan(plan: CheckPlan, expectations: Expectation[], strengthened = false): CheckPlan {
  validateExpectations(expectations);
  const ids = new Set(plan.assertions.map(({ expectationId }) => expectationId));
  const keys = plan.assertions.map((assertion) => `${assertion.expectationId}:${assertion.observation}`);
  if ((!strengthened && ids.size !== plan.assertions.length) || ids.size !== expectations.length || new Set(keys).size !== keys.length) throw new Error("Checks must cover each confirmed expectation exactly once per supported observation.");
  for (const assertion of plan.assertions) {
    if (!expectations.some(({ id }) => id === assertion.expectationId)
      || !(assertion.observation === BEHAVIORS[assertion.expectationId] || (strengthened && (
        (assertion.expectationId === "E1" && assertion.observation === "fresh-sign-in")
        || (assertion.expectationId === "E2" && assertion.observation === "other-customer-reopen")
      )))
      || assertion.expectedCount !== (assertion.expectationId === "E2" ? 0 : 1)) {
      throw new Error("A drafted check changes or omits a confirmed expectation.");
    }
  }
  const order = ["E2", "E1", "E3", "E4"];
  return { assertions: [...plan.assertions].sort((a, b) => order.indexOf(a.expectationId) - order.indexOf(b.expectationId)) };
}

export function validateDecoyDraft(draft: DecoyDraft): void {
  if (new Set(draft.decoys.map(({ category }) => category)).size !== 3) throw new Error("Expected one development decoy for each of T1, T3 and T4.");
  for (const decoy of draft.decoys) {
    if (decoy.category === "T4" ? decoy.edits.length !== 0 : decoy.edits.length === 0) {
      throw new Error("T4 uses the curated failing-insert mutation; T1 and T3 require generated edits.");
    }
    const expected = decoy.category === "T3"
      ? [{ probe: "appointment-saved", holds: true }, { probe: "appointment-owned-by-customer", holds: false }]
      : [{ probe: "appointment-saved", holds: false }];
    if (decoy.requirements.length !== expected.length || !expected.every((requirement) => decoy.requirements.some(
      ({ probe, holds }) => probe === requirement.probe && holds === requirement.holds,
    ))) throw new Error("Decoy requirements do not confirm its declared development category.");
  }
}
