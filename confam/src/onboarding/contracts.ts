import type { META_BASE_URL } from "../models/config.js";
import { z } from "zod";
import type { WorkflowPlan } from "../workflows/schema.js";
import type { RequirementsProposal } from "../authoring/onboarding.js";
export const reviewedRequirementsSchema = z.strictObject({
  expectations: z
    .array(
      z.strictObject({
        id: z
          .string()
          .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
          .max(100),
        statement: z.string().trim().min(1).max(2000),
        provenance: z.enum(["report", "developer"]),
      }),
    )
    .min(1)
    .max(20),
  fixtures: z.record(z.string(), z.json()),
  reproductionTargets: z.array(z.string()).min(1).max(20),
  answers: z
    .array(
      z.strictObject({
        question: z.string().min(1).max(2000),
        answer: z.string().trim().min(1).max(2000),
      }),
    )
    .max(20),
});
export type ReviewedRequirements = z.infer<typeof reviewedRequirementsSchema>;
export interface ExportPreview {
  approvalId?: string;
  hash: string;
  destination: typeof META_BASE_URL;
  model: string;
  capUsd: number;
  payload: {
    instructions: string;
    input: string;
    schema: Record<string, unknown>;
    maxOutputTokens: number;
  };
  recording?: {
    name: string;
    sha256: string;
    bytes: number;
    durationSeconds: number;
  };
}
export interface OnboardingSession {
  id: string;
  projectId: string;
  projectName: string;
  caseId: string;
  report: string;
  mode: "live" | "fixture";
  status:
    | "export-review"
    | "requirements-review"
    | "workflow-review"
    | "confirmed"
    | "error"
    | "generating";
  phase: "intake" | "checks";
  preview?: ExportPreview;
  requirements?: RequirementsProposal;
  reviewed?: ReviewedRequirements;
  workflow?: WorkflowPlan;
  error?: string;
  usage?: {
    estimatedSpendUsd: number;
    budgetUsedUsd: number;
    hasUncertainUsage: boolean;
  };
  files?: {
    case: string;
    workflow: string;
    report: string;
    confirmation: string;
    command: string;
  };
}
