import { z } from "zod";
import { relativePathSchema } from "../project/config.js";
import { probeRegistrySchema } from "../probes/index.js";
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/).max(80);
export const decoySchema = z.strictObject({
  id, patch: relativePathSchema, baseControl: id, violation: z.string().min(1).max(2000),
  expectationIds: z.array(id).min(1).max(20),
  requirements: z.array(z.strictObject({ probe: id, holds: z.boolean() })).min(1).max(30),
}).superRefine((decoy, context) => {
  if (!decoy.requirements.some(({ holds }) => !holds)) context.addIssue({ code: "custom", message: "A decoy must require an independently observed violation." });
  if (new Set(decoy.requirements.map(({ probe }) => probe)).size !== decoy.requirements.length) context.addIssue({ code: "custom", message: "Duplicate probe requirements." });
  if (new Set(decoy.expectationIds).size !== decoy.expectationIds.length) context.addIssue({ code: "custom", message: "Duplicate expectation mappings." });
});
export const comparatorMetadataSchema = z.strictObject({
  modelId: z.string().max(200).nullable(), modelVersion: z.string().max(200).nullable(),
  prompt: z.string().max(30000).nullable(), inputHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  budgetUsd: z.number().finite().nonnegative().nullable(), authoringMs: z.number().int().nonnegative().nullable(),
});
export type ComparatorMetadata = z.infer<typeof comparatorMetadataSchema>;
export const challengeManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), purpose: z.literal("development"),
  probes: probeRegistrySchema,
  decoys: z.array(decoySchema).min(1).max(20),
  comparators: z.array(z.strictObject({
    role: z.enum(["existing", "direct-ai"]), workflow: relativePathSchema,
    provenance: z.string().min(1).max(2000), metadata: comparatorMetadataSchema.optional(),
  })).max(2).default([]),
});
export const evaluationPackSchema = z.strictObject({
  schemaVersion: z.literal(1), purpose: z.enum(["held-out", "integration-fixture"]),
  label: z.string().min(1).max(1000), decoys: z.array(decoySchema).min(1).max(20),
});
export type Decoy = z.infer<typeof decoySchema>;
