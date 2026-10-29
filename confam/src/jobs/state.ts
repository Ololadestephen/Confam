import { z } from "zod";
import { projectConfigSchema } from "../project/config.js";
import { caseDefinitionSchema } from "../project/case.js";
import { workflowSchema } from "../workflows/schema.js";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const jobSchema = z.strictObject({
  id: z.uuid(),
  draftId: z.uuid(),
  status: z.enum([
    "ready",
    "running",
    "cancelling",
    "completed",
    "blocked",
    "error",
    "cancelled",
    "interrupted",
  ]),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  phase: z.string().optional(),
  runId: z
    .string()
    .regex(/^verify-[a-zA-Z0-9-]+$/)
    .optional(),
  verdict: z.string().optional(),
  error: z.string().optional(),
  cleanupComplete: z.boolean().optional(),
  preview: z.strictObject({
    hash: sha,
    toolHash: sha,
    runsDirectory: z.string(),
    report: z.string().max(65536),
    recording: z
      .strictObject({ sha256: sha, bytes: z.number().int().nonnegative() })
      .optional(),
    projectName: z.string(),
    caseId: z.string(),
    root: z.string(),
    command: z.array(z.string()).min(1).max(64),
    manifest: z.strictObject({
      sha256: sha,
      bytes: z.number().int().nonnegative(),
      files: z
        .array(
          z.strictObject({
            path: z.string(),
            sha256: sha,
            bytes: z.number().int().nonnegative(),
            mode: z.number().int(),
          }),
        )
        .max(2000),
    }),
    configuration: projectConfigSchema,
    definition: caseDefinitionSchema,
    workflow: workflowSchema,
    confirmationHash: sha,
    candidate: z
      .strictObject({
        name: z.string().min(1).max(200),
        text: z.string().max(1048576),
        sha256: sha,
        bytes: z.number().int().nonnegative().max(1048576),
      })
      .optional(),
    limitations: z.array(z.string()),
  }),
  events: z
    .array(
      z.object({
        sequence: z.number().int().nonnegative(),
        at: z.string(),
        phase: z.enum([
          "preparing",
          "frozen",
          "variant-start",
          "runtime-ready",
          "step",
          "variant-finish",
          "finished",
        ]),
        variantId: z.string().max(100).optional(),
        kind: z.enum(["original", "control", "candidate"]).optional(),
        stepIndex: z.number().int().nonnegative().optional(),
        action: z.string().max(100).optional(),
        outcome: z.string().max(1000).optional(),
        reportPath: z.string().optional(),
      }),
    )
    .max(1200),
});
export const requestSchema = z.strictObject({
  id: z.uuid(),
  nonce: sha,
  runsDirectory: z.string(),
  project: z.string(),
  caseFile: z.string(),
  workflow: z.string(),
  candidate: z.string().optional(),
  confirmation: z.enum(["developer-web", "fixture"]),
});
export const leaseSchema = z.strictObject({
  id: z.uuid(),
  nonce: sha,
  managerPid: z.number().int().positive(),
  workerPid: z.number().int().positive().optional(),
});
export type WorkerRequest = z.infer<typeof requestSchema>;
export type Lease = z.infer<typeof leaseSchema>;
