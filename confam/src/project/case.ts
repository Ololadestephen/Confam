import { z } from "zod";
import { relativePathSchema } from "./config.js";

const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
export const caseDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: identifier,
  projectId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  report: relativePathSchema,
  recording: relativePathSchema.optional(),
  fixtures: z.record(z.string(), z.json()),
  expectations: z.array(z.strictObject({
    id: identifier,
    statement: z.string().min(1).max(2000),
    provenance: z.enum(["report", "developer"]),
  })).min(1),
  reproductionTargets: z.array(identifier).min(1),
  controls: z.array(z.strictObject({ id: identifier, patch: relativePathSchema })).default([]),
  mode: z.enum(["verification", "benchmark"]),
}).superRefine((definition, context) => {
  const ids = definition.expectations.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Duplicate expectation IDs." });
  if (new Set(definition.reproductionTargets).size !== definition.reproductionTargets.length
    || definition.reproductionTargets.some((id) => !ids.includes(id))) {
    context.addIssue({ code: "custom", message: "Reproduction targets must be distinct confirmed expectation references." });
  }
  const controlIds = definition.controls.map(({ id }) => id);
  if (new Set(controlIds).size !== controlIds.length
    || controlIds.some((id) => ["original", "candidate"].includes(id))) {
    context.addIssue({ code: "custom", message: "Control IDs must be unique and not reserved." });
  }
  if (new Set(definition.controls.map(({ patch }) => patch)).size !== definition.controls.length) {
    context.addIssue({ code: "custom", message: "Controls must reference distinct patches." });
  }
  if (definition.mode === "benchmark" && definition.controls.length < 2) {
    context.addIssue({ code: "custom", message: "Benchmark cases require two independently reviewed correct controls." });
  }
});
export type CaseDefinition = z.infer<typeof caseDefinitionSchema>;
