import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { workflowSchema, validateWorkflow } from "../workflows/schema.js";
import { caseDefinitionSchema } from "../project/case.js";
import { resolveProjectConfig } from "../project/config.js";
import { boundedText } from "./storage.js";
import { definition, hash } from "./context.js";
import type { StoredDraft } from "./state.js";

const confirmationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.enum(["fixture", "developer-web", "agent-cli"]),
  confirmedAt: z.string(),
  draftId: z.uuid(),
  caseHash: z.string(),
  workflowHash: z.string(),
  projectRevision: z.string(),
  sourceHash: z.string(),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })),
  scope: z.string(),
});
async function jsonFile(file: string) {
  try {
    return JSON.parse(await boundedText(file, 1024 * 1024));
  } catch {
    throw new Error("Confirmed execution input is missing or invalid.");
  }
}
export async function loadExecutionInputs(draft: StoredDraft, folder: string) {
  if (
    draft.session.status !== "confirmed" ||
    !draft.session.reviewed ||
    !draft.session.workflow
  )
    throw new Error("Confirm the draft before preparing execution.");
  const expected = definition(draft, draft.session.reviewed);
  const savedCase = caseDefinitionSchema.parse(
    await jsonFile(path.join(folder, "case.json")),
  );
  const workflow = workflowSchema.parse(
    await jsonFile(path.join(folder, "workflow.json")),
  );
  const confirmation = confirmationSchema.parse(
    await jsonFile(path.join(folder, "confirmation.json")),
  );
  const report = await boundedText(path.join(folder, "report.md"), 65536);
  if (
    hash(savedCase) !== hash(expected) ||
    hash(workflow) !== hash(draft.session.workflow) ||
    report !== draft.session.report ||
    confirmation.caseHash !== hash(savedCase) ||
    confirmation.workflowHash !== hash(workflow) ||
    confirmation.draftId !== draft.session.id ||
    confirmation.projectRevision !== draft.projectRevision ||
    confirmation.sourceHash !== draft.sourceHash ||
    (confirmation.source === "fixture") !== (draft.session.mode === "fixture")
  )
    throw new Error(
      "Confirmed inputs changed. Review and confirm a new draft before execution.",
    );
  validateWorkflow(
    workflow,
    savedCase.expectations,
    savedCase.fixtures,
    draft.config.runtime,
  );
  const { root } = await resolveProjectConfig(draft.configPath, draft.config);
  let recording: Buffer | undefined;
  if (draft.recording) {
    // Stored base64 was already validated before confirmation. Bind the saved clip too.
    const { readRecording } = await import("../recordings/mp4.js");
    const saved = await readRecording(path.join(folder, "recording.mp4"));
    if (
      createHash("sha256").update(saved.bytes).digest("hex") !==
      draft.recording.sha256
    )
      throw new Error("Confirmed recording changed.");
    recording = saved.bytes;
  }
  return {
    draftId: draft.session.id,
    projectId: draft.session.projectId,
    projectName: draft.session.projectName,
    mode: draft.session.mode,
    root,
    configuration: draft.config,
    definition: savedCase,
    workflow,
    report,
    confirmation,
    recording,
  };
}
export type ExecutionInputs = Awaited<ReturnType<typeof loadExecutionInputs>>;
