import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boundedText, writePrivate } from "../onboarding/storage.js";
import { hash as confirmationHash } from "../onboarding/context.js";
import { projectConfigSchema } from "../project/config.js";
import { caseDefinitionSchema } from "../project/case.js";
import { workflowSchema } from "../workflows/schema.js";
import { captureProject } from "./snapshot.js";
import type { ExecutionJob, ExecutionPreview } from "./contracts.js";
export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function stableHash(value: unknown) {
  return sha256(JSON.stringify(canonical(value)));
}
export function previewHash(value: ExecutionPreview) {
  const { hash, ...contents } = value;
  return stableHash(contents);
}
export async function toolIdentity() {
  const hash = createHash("sha256");
  for (const file of [
    "worker.ts",
    "inputs.ts",
    "../project/verify.ts",
    "../project/runtime.ts",
    "../workflows/runner.ts",
    "../workflows/schema.ts",
    "../workflows/actions.ts",
  ]) {
    hash.update(file);
    hash.update(await readFile(fileURLToPath(new URL(file, import.meta.url))));
  }
  return hash.digest("hex");
}
export function inputPaths(folder: string) {
  const directory = path.join(folder, "input");
  return {
    directory,
    project: path.join(directory, "project.json"),
    caseFile: path.join(directory, "case.json"),
    workflow: path.join(directory, "workflow.json"),
    candidate: path.join(directory, "candidate.patch"),
    report: path.join(directory, "report.md"),
    confirmation: path.join(directory, "confirmation.json"),
    recording: path.join(directory, "recording.mp4"),
    app: path.join(directory, "app"),
  };
}
export async function jsonInput(file: string) {
  try {
    return JSON.parse(await boundedText(file, 1024 * 1024));
  } catch {
    throw new Error("Frozen execution input is invalid or unavailable.");
  }
}
export async function validateInputs(job: ExecutionJob, folder: string) {
  const preview = job.preview;
  if (
    previewHash(preview) !== preview.hash ||
    (await toolIdentity()) !== preview.toolHash
  )
    throw new Error(
      "Execution inputs or executor changed after approval. Prepare a new execution preview.",
    );
  const files = inputPaths(folder);
  if ((await captureProject(files.app)).sha256 !== preview.manifest.sha256)
    throw new Error("Frozen application snapshot changed.");
  if (
    stableHash(projectConfigSchema.parse(await jsonInput(files.project))) !==
      stableHash(preview.configuration) ||
    stableHash(caseDefinitionSchema.parse(await jsonInput(files.caseFile))) !==
      stableHash(preview.definition) ||
    stableHash(workflowSchema.parse(await jsonInput(files.workflow))) !==
      stableHash(preview.workflow) ||
    (await boundedText(files.report, 65536)) !== preview.report
  )
    throw new Error("Frozen case, workflow, report or configuration changed.");
  if (
    confirmationHash(await jsonInput(files.confirmation)) !==
    preview.confirmationHash
  )
    throw new Error("Frozen confirmation changed.");
  if (
    preview.candidate &&
    sha256(await boundedText(files.candidate, 1024 * 1024)) !==
      preview.candidate.sha256
  )
    throw new Error("Frozen candidate patch changed.");
  if (preview.recording) {
    const { readRecording } = await import("../recordings/mp4.js");
    const clip = await readRecording(files.recording);
    if (
      sha256(clip.bytes) !== preview.recording.sha256 ||
      clip.bytes.length !== preview.recording.bytes
    )
      throw new Error("Frozen recording changed.");
  }
  return files;
}
export async function saveJson(file: string, value: unknown) {
  await writePrivate(file, JSON.stringify(value, null, 2));
}
