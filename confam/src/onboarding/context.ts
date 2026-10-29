import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { modelWorkflowSchema } from "../authoring/model-workflow.js";
import {
  requirementsWireSchema,
  REQUIREMENTS_INSTRUCTIONS,
  WORKFLOW_INSTRUCTIONS,
} from "../authoring/onboarding.js";
import {
  META_BASE_URL,
  STAGE_MODELS,
  DEFAULT_BUDGET_USD,
} from "../models/config.js";
import {
  confinedPath,
  resolveProjectConfig,
  projectConfigSchema,
} from "../project/config.js";
import { caseDefinitionSchema } from "../project/case.js";
import { sanitizeExport } from "./export.js";
import { boundedText } from "./storage.js";
import type { StoredDraft } from "./state.js";
import type { ReviewedRequirements, ExportPreview } from "./contracts.js";

export const MAX_CONTEXT_BYTES = 250_000;
export const reportInputSchema = z.strictObject({
  projectId: z.uuid(),
  caseId: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
    .max(100),
  report: z.string().trim().min(1).max(65536),
  recording: z
    .strictObject({
      name: z
        .string()
        .min(1)
        .max(200)
        .regex(/\.mp4$/i),
      dataBase64: z
        .string()
        .max(14_000_000)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .optional(),
});
export function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function rejectPrivate(file: string) {
  if (/(?:^|\/)evals\/heldout(?:\/|$)/.test(file))
    throw new Error("Private held-out paths cannot be inspected.");
}
export async function sourceContext(configPath: string) {
  rejectPrivate(configPath);
  let raw: unknown;
  try {
    raw = JSON.parse(await boundedText(configPath, 128 * 1024));
  } catch {
    throw new Error("Project configuration is invalid or inaccessible.");
  }
  const config = projectConfigSchema.parse(raw);
  const declaredRoot = path.resolve(path.dirname(configPath), config.root);
  rejectPrivate(declaredRoot);
  for (const source of config.sourceFiles)
    rejectPrivate(path.resolve(declaredRoot, source));
  if (config.runtime.cwd)
    rejectPrivate(path.resolve(declaredRoot, config.runtime.cwd));
  const { root } = await resolveProjectConfig(configPath, config);
  const source: Record<string, string> = {};
  for (const file of config.sourceFiles) {
    rejectPrivate(path.resolve(root, file));
    source[file] = await boundedText(
      await confinedPath(root, file),
      MAX_CONTEXT_BYTES,
    );
    if (Buffer.byteLength(JSON.stringify(source)) > MAX_CONTEXT_BYTES)
      throw new Error(
        "Source context exceeds 250KB. Narrow the approved source scope.",
      );
  }
  return { config, source };
}
export function definition(
  draft: StoredDraft,
  requirements: ReviewedRequirements,
) {
  return caseDefinitionSchema.parse({
    schemaVersion: 1,
    id: draft.session.caseId,
    projectId: draft.config.id,
    report: "report.md",
    ...(draft.recording ? { recording: "recording.mp4" } : {}),
    fixtures: requirements.fixtures,
    expectations: requirements.expectations,
    reproductionTargets: requirements.reproductionTargets,
    controls: [],
    mode: "verification",
    purpose: draft.session.mode === "fixture" ? "fixture" : "verification",
  });
}
export function preview(
  draft: StoredDraft,
  input: unknown,
  approvalId: string = randomUUID(),
) {
  const intake = draft.session.phase === "intake";
  const payload = {
    instructions: intake ? REQUIREMENTS_INSTRUCTIONS : WORKFLOW_INSTRUCTIONS,
    input: JSON.stringify(sanitizeExport(input)),
    schema: z.toJSONSchema(
      intake ? requirementsWireSchema : modelWorkflowSchema,
    ),
    maxOutputTokens: intake ? 4096 : 8192,
  };
  if (Buffer.byteLength(payload.input) > MAX_CONTEXT_BYTES)
    throw new Error(
      "Export context exceeds 250KB. Narrow the report or source scope.",
    );
  const value: Omit<ExportPreview, "hash"> = {
    approvalId,
    destination: META_BASE_URL,
    model: STAGE_MODELS[intake ? "intake" : "checks"],
    capUsd: DEFAULT_BUDGET_USD,
    payload,
    ...(intake && draft.recording ? { recording: draft.recording } : {}),
  };
  return { ...value, hash: hash(value) };
}
