import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { workflowSchema, type WorkflowPlan } from "../workflows/schema.js";

export interface WorkflowSurvivor {
  id: string;
  violation: string;
  patch: string;
  observations: unknown;
}
export interface VersionEvaluation {
  gatePassed: boolean;
  survivors: WorkflowSurvivor[];
  results: unknown;
}
export interface WorkflowVersion extends VersionEvaluation {
  version: number;
  plan: WorkflowPlan;
}
export interface StrengtheningRequest {
  round: number;
  plan: WorkflowPlan;
  survivors: WorkflowSurvivor[];
}
export interface StrengtheningProposal {
  plan: unknown;
  reason: string;
  reviewReasons: string[];
}
export interface ArchivedProposal extends StrengtheningProposal {
  valid: boolean;
  original: unknown;
}
export interface VersionOptions {
  initial: WorkflowPlan;
  evaluate(plan: WorkflowPlan, version: number): Promise<VersionEvaluation>;
  strengthen?(request: StrengtheningRequest): Promise<StrengtheningProposal>;
  preserve?(record: WorkflowVersion): Promise<void>;
  proposal?(round: number, proposal: ArchivedProposal): Promise<void>;
}
export interface VersionResult {
  status: "ready" | "blocked" | "needs-review";
  versions: WorkflowVersion[];
  rounds: number;
  reason: string;
  reviewReasons?: string[];
}

const MAX_ROUNDS = 2;
const proposalSchema = z.strictObject({
  plan: workflowSchema,
  reason: z.string().min(1).max(4000),
  reviewReasons: z.array(z.string().min(1).max(2000)).max(50),
});

function changedRequirements(before: WorkflowPlan, after: WorkflowPlan): string[] {
  const reasons: string[] = [];
  if (!isDeepStrictEqual(before.steps, after.steps.slice(0, before.steps.length))) {
    reasons.push("An existing workflow step or assertion was altered, removed, or reordered.");
  }
  const knownIds = new Set(before.steps.filter((step) => step.action === "assert").map((step) => step.expectationId));
  if (after.steps.some((step) => step.action === "assert" && !knownIds.has(step.expectationId))) {
    reasons.push("A strengthening assertion introduced an unconfirmed expectation ID.");
  }
  return reasons;
}

function inspectProposal(plan: WorkflowPlan, raw: StrengtheningProposal) {
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false as const, reviewReasons: ["Strengthening proposal does not match the supported workflow/proposal schema."] };
  }
  return {
    valid: true as const, proposal: parsed.data,
    reviewReasons: [...parsed.data.reviewReasons, ...changedRequirements(plan, parsed.data.plan)],
  };
}

export async function evaluateVersions(options: VersionOptions): Promise<VersionResult> {
  const versions: WorkflowVersion[] = [];
  let plan = workflowSchema.parse(options.initial);
  let rounds = 0;
  const finish = (status: VersionResult["status"], reason: string, reviewReasons?: string[]): VersionResult => ({
    status, reason, rounds, versions: structuredClone(versions), ...(reviewReasons ? { reviewReasons: [...reviewReasons] } : {}),
  });
  for (let version = 1;version <= MAX_ROUNDS + 1;version += 1) {
    // Runtime callbacks receive snapshots, never the canonical plan or history.
    const evaluation = structuredClone(await options.evaluate(structuredClone(plan), version));
    const record: WorkflowVersion = {
      version, plan: structuredClone(plan), gatePassed: evaluation.gatePassed,
      survivors: evaluation.survivors, results: evaluation.results,
    };
    versions.push(record);
    await options.preserve?.(structuredClone(record));
    if (!record.gatePassed) return finish("blocked", "control-or-reproduction-gate");
    if (record.survivors.length === 0) return finish("ready", "no-survivors");
    if (!options.strengthen) return finish("ready", "strengthening-unavailable");
    if (rounds === MAX_ROUNDS) return finish("ready", "round-limit");
    rounds += 1;
    const raw = structuredClone(await options.strengthen({
      round: rounds, plan: structuredClone(plan), survivors: structuredClone(record.survivors),
    }));
    const inspection = inspectProposal(plan, raw);
    await options.proposal?.(rounds, {
      ...structuredClone(raw), valid: inspection.valid, original: structuredClone(raw),
      reviewReasons: [...inspection.reviewReasons],
    });
    if (!inspection.valid) return finish("needs-review", "invalid-proposal", inspection.reviewReasons);
    if (inspection.reviewReasons.length > 0) return finish("needs-review", "expectation-change", inspection.reviewReasons);
    const next = inspection.proposal.plan;
    if (isDeepStrictEqual(plan, next)) return finish("ready", "verifier-no-change");
    plan = structuredClone(next);
  }
  return finish("ready", "round-limit");
}
