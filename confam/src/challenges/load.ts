import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { readJson } from "../engine/json.js";
import { confinedPath } from "../project/config.js";
import { workflowSchema } from "../workflows/schema.js";
import { challengeManifestSchema, evaluationPackSchema, type Decoy } from "./schema.js";
import type { CaseDefinition } from "../project/case.js";
import type { ProbeDefinition } from "../probes/index.js";

const MAX_CHALLENGE_BYTES = 250_000;

async function regularText(root: string, file: string) {
  const resolved = await confinedPath(root, file);
  const entry = await lstat(resolved);
  if (!entry.isFile() || entry.size > MAX_CHALLENGE_BYTES) throw new Error("Challenge inputs must be regular files of at most 250KB.");
  return readFile(resolved, "utf8");
}
export function validateDecoys(decoys: Decoy[], definition: CaseDefinition, probes: ProbeDefinition[]) {
  if (new Set(decoys.map(({ id }) => id)).size !== decoys.length) throw new Error("Duplicate decoy IDs.");
  for (const decoy of decoys) {
    if (!definition.controls.some(({ id }) => id === decoy.baseControl)) throw new Error("A decoy requires an available independently correct reference control.");
    if (decoy.expectationIds.some((id) => !definition.expectations.some((expectation) => expectation.id === id))) throw new Error("Unknown declared expectation violation.");
    if (decoy.requirements.some(({ probe }) => !probes.some(({ id }) => id === probe))) throw new Error("Unknown independent probe reference.");
  }
}
export async function loadChallengeManifest(file: string, definition: CaseDefinition) {
  if (!(await lstat(file)).isFile()) throw new Error("Challenge manifest must be a regular file.");
  const manifest = challengeManifestSchema.parse(await readJson(file));
  validateDecoys(manifest.decoys, definition, manifest.probes);
  if (new Set(manifest.comparators.map(({ role }) => role)).size !== manifest.comparators.length) throw new Error("Duplicate comparator roles.");
  const directory = path.dirname(file);
  const decoys = [];
  for (const decoy of manifest.decoys) decoys.push({ ...decoy, contents: await regularText(directory, decoy.patch) });
  const comparators = [];
  for (const comparator of manifest.comparators) {
    const text = await regularText(directory, comparator.workflow);
    let plan: unknown;
    try {
      plan = JSON.parse(text);
    } catch {
      throw new Error("Comparator workflow is not valid JSON.");
    }
    comparators.push({ ...comparator, plan: workflowSchema.parse(plan) });
  }
  return { manifest, decoys, comparators };
}
export async function loadEvaluationPack(file: string, definition: CaseDefinition, probes: ProbeDefinition[]) {
  if (!(await lstat(file)).isFile()) throw new Error("Evaluation pack must be a regular file.");
  const pack = evaluationPackSchema.parse(await readJson(file));
  validateDecoys(pack.decoys, definition, probes);
  const decoys = [];
  for (const decoy of pack.decoys) decoys.push({ ...decoy, contents: await regularText(path.dirname(file), decoy.patch) });
  return { pack, decoys };
}
