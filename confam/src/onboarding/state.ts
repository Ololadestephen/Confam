import { META_BASE_URL } from "../models/config.js";
import { z } from "zod";
import { requirementsProposalSchema } from "../authoring/onboarding.js";
import { projectConfigSchema } from "../project/config.js";
import { workflowSchema } from "../workflows/schema.js";
import { reviewedRequirementsSchema } from "./contracts.js";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const recordingSchema = z.strictObject({
  name: z.string().min(1).max(200),
  sha256: digest,
  bytes: z.number().int().min(1).max(10485760),
  durationSeconds: z.number().positive().max(120),
});
export const storedDraftSchema = z
  .strictObject({
    session: z.strictObject({
      id: z.uuid(),
      projectId: z.uuid(),
      projectName: z.string(),
      caseId: z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
        .max(100),
      report: z.string().min(1).max(65536),
      mode: z.enum(["live", "fixture"]),
      status: z.enum([
        "export-review",
        "requirements-review",
        "workflow-review",
        "confirmed",
        "error",
        "generating",
      ]),
      phase: z.enum(["intake", "checks"]),
      preview: z
        .strictObject({
          hash: digest,
          approvalId: z.uuid().optional(),
          destination: z.literal(META_BASE_URL),
          model: z.string(),
          capUsd: z.number().positive().max(0.25),
          payload: z.strictObject({
            instructions: z.string(),
            input: z.string(),
            schema: z.record(z.string(), z.unknown()),
            maxOutputTokens: z.number().int().positive(),
          }),
          recording: recordingSchema.optional(),
        })
        .optional(),
      requirements: requirementsProposalSchema.optional(),
      reviewed: reviewedRequirementsSchema.optional(),
      workflow: workflowSchema.optional(),
      error: z.string().optional(),
      usage: z
        .object({
          estimatedSpendUsd: z.number(),
          budgetUsedUsd: z.number(),
          hasUncertainUsage: z.boolean(),
        })
        .optional(),
      files: z
        .strictObject({
          case: z.string(),
          workflow: z.string(),
          report: z.string(),
          confirmation: z.string(),
          command: z.string(),
        })
        .optional(),
    }),
    projectRevision: digest,
    configPath: z.string(),
    config: projectConfigSchema,
    source: z.record(z.string(), z.string()),
    sourceHash: digest,
    videoBase64: z.string().max(14000000).optional(),
    recording: recordingSchema.optional(),
  })
  .superRefine((draft, context) => {
    if (Boolean(draft.videoBase64) !== Boolean(draft.recording))
      context.addIssue({
        code: "custom",
        message: "Recording bytes and metadata must be present together.",
      });
    const session = draft.session;
    if (session.status === "export-review" && !session.preview)
      context.addIssue({
        code: "custom",
        message: "Export preview is missing.",
      });
    if (
      (session.status === "requirements-review" ||
        session.phase === "checks") &&
      !session.requirements
    )
      context.addIssue({
        code: "custom",
        message: "Requirements proposal is missing.",
      });
    if (session.phase === "checks" && !session.reviewed)
      context.addIssue({
        code: "custom",
        message: "Reviewed requirements are missing.",
      });
    if (
      (session.status === "workflow-review" ||
        session.status === "confirmed") &&
      !session.workflow
    )
      context.addIssue({ code: "custom", message: "Workflow is missing." });
    if (session.status === "confirmed" && !session.files)
      context.addIssue({
        code: "custom",
        message: "Confirmed artifacts are missing.",
      });
  });
export type StoredDraft = z.infer<typeof storedDraftSchema>;
