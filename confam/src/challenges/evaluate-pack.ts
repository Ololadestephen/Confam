import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { readJson } from "../engine/json.js";
import { freezeBundle, verifyChecks } from "../engine/freeze.js";
import { git, errorMessage } from "../engine/process.js";
import { caseDefinitionSchema } from "../project/case.js";
import { projectConfigSchema } from "../project/config.js";
import { evaluate, executorIdentity, type EvaluatedVariant, type Evaluation } from "../project/verify.js";
import { probeRegistrySchema } from "../probes/index.js";
import { workflowSchema } from "../workflows/schema.js";
import { correctReference, sealSchema, verifyEngine, type Arm } from "./harness.js";
import { loadEvaluationPack } from "./load.js";
import { classifyChallenge, countChallenges } from "./classify.js";
import { comparatorMetadataSchema, type ComparatorMetadata } from "./schema.js";

const armsSchema = z.array(z.strictObject({ role: z.enum(["existing", "direct-ai", "confam-v1", "confam-final"]), provenance: z.string(), plan: workflowSchema, metadata: comparatorMetadataSchema.optional() })).min(2).max(4);
async function loadSealed(directory: string) {
  const report = await readJson<Record<string, unknown>>(path.join(directory, "challenge-report.json"));
  const seal = sealSchema.parse(await readJson(path.join(directory, "challenge-seal.json")));
  if (report.status !== "completed" || !isDeepStrictEqual(report.seal, seal)) throw new Error("No matching completed final challenge seal.");
  if (path.resolve(seal.checks.directory) !== path.join(path.resolve(directory), "seal")) throw new Error("Seal path escapes its run.");
  await verifyChecks(seal.checks); await verifyEngine(seal.identity);
  const baseline = path.join(directory, "baseline");
  if ((await git(baseline, "rev-parse", "HEAD")).trim() !== seal.revision || (await git(baseline, "status", "--porcelain")).trim()) throw new Error("Baseline changed after final freeze.");
  const confirmation = z.object({ source: z.enum(["developer-cli", "fixture"]), expectations: z.array(z.unknown()) }).parse(await readJson(path.join(seal.checks.directory, "confirmation.json")));
  if (report.confirmation !== confirmation.source) throw new Error("Run confirmation metadata differs from the sealed confirmation.");
  const definition = caseDefinitionSchema.parse(await readJson(path.join(seal.checks.directory, "case.json")));
  const project = projectConfigSchema.parse(await readJson(path.join(seal.checks.directory, "project.json")));
  const probes = probeRegistrySchema.parse(await readJson(path.join(seal.checks.directory, "probes.json")));
  const arms = armsSchema.parse(await readJson(path.join(seal.checks.directory, "arms.json")));
  if (new Set(arms.map(({ role }) => role)).size !== arms.length || !arms.some(({ role }) => role === "confam-final")) throw new Error("Invalid sealed comparator roles.");
  if (!isDeepStrictEqual(confirmation.expectations, definition.expectations)) throw new Error("Sealed expectations and confirmation differ.");
  return { report, seal, baseline, definition, project, probes, arms, confirmation };
}
type Sealed = Awaited<ReturnType<typeof loadSealed>>;
interface ScoredArm {
  role: Arm["role"]; provenance: string; metadata?: ComparatorMetadata; provenanceVerified: false; controls: EvaluatedVariant[]; falseRejections: number; controlErrors: number;
  results: { id: string; outcome: ReturnType<typeof classifyChallenge>; checks: EvaluatedVariant }[]; counts?: ReturnType<typeof countChallenges>;
}
function failedControls(controls: EvaluatedVariant[]) {
  return controls.filter(({ result, error }) => !error && result?.status === "assertion-failed").length;
}
async function makeRun(sealed: Sealed, directory: string, arm: Arm, files: Record<string, string>): Promise<Evaluation> {
  const checks = await freezeBundle(path.join(directory, "checks"), { ...files, "workflow.json": JSON.stringify(arm.plan) });
  return {
    baseline: sealed.baseline, directory, checks, revision: sealed.seal.revision, executor: await executorIdentity(),
    project: sealed.project, definition: sealed.definition, plan: arm.plan
  };
}
async function checkControl(run: Evaluation, id: string) {
  return evaluate(run, `control-${id}`, "control", path.join(run.checks.directory, `control-${id}.patch`));
}

type LoadedPack = Awaited<ReturnType<typeof loadEvaluationPack>>;
type PackDecoy = LoadedPack["decoys"][number];
interface QualifiedFault {
  id: string;
  outcome: ReturnType<typeof classifyChallenge>;
  variant: EvaluatedVariant;
}

async function packFiles(sealed: Sealed, loaded: LoadedPack) {
  const digest = createHash("sha256").update(JSON.stringify(loaded.pack));
  const files: Record<string, string> = { "pack.json": JSON.stringify(loaded.pack), "probes.json": JSON.stringify(sealed.probes) };
  for (const control of sealed.definition.controls) {
    files[`control-${control.id}.patch`] = await readFile(path.join(sealed.seal.checks.directory, `control-${control.id}.patch`), "utf8");
  }
  for (const decoy of loaded.decoys) {
    files[`decoy-${decoy.id}.patch`] = decoy.contents;
    digest.update(JSON.stringify([decoy.id, Buffer.byteLength(decoy.contents, "utf8")])).update(decoy.contents);
  }
  return { files, packHash: digest.digest("hex") };
}

async function qualifyFault(sealed: Sealed, run: Evaluation, decoy: PackDecoy, qualification: QualifiedFault[]): Promise<QualifiedFault> {
  const existing = qualification.find(({ id }) => id === decoy.id);
  if (existing) return existing;
  const variant = await evaluate({
    ...run, probes: sealed.probes,
    referencePatch: path.join(run.checks.directory, `control-${decoy.baseControl}.patch`)
  },
    `decoy-${decoy.id}`, "candidate", path.join(run.checks.directory, `decoy-${decoy.id}.patch`));
  const qualified = { id: decoy.id, outcome: classifyChallenge(decoy, variant), variant };
  qualification.push(qualified);
  return qualified;
}

async function scoreFault(sealed: Sealed, run: Evaluation, decoy: PackDecoy, label: QualifiedFault): Promise<ScoredArm["results"][number]> {
  if (!["caught", "survived", "unrelated-assertion"].includes(label.outcome)) {
    return { id: decoy.id, outcome: label.outcome, checks: { id: decoy.id, kind: "candidate", error: "Fault could not be independently qualified; arm not scored." } };
  }
  await verifyEngine(sealed.seal.identity); await verifyChecks(sealed.seal.checks);
  const checks = await evaluate({ ...run, referencePatch: path.join(run.checks.directory, `control-${decoy.baseControl}.patch`) },
    `decoy-${decoy.id}`, "candidate", path.join(run.checks.directory, `decoy-${decoy.id}.patch`));
  // Shared labels qualify faults; only this arm's workflow assertions score detection.
  return { id: decoy.id, outcome: classifyChallenge(decoy, { ...checks, probes: label.variant.probes }), checks };
}

async function scoreArm(sealed: Sealed, directory: string, arm: Arm, files: Record<string, string>,
  decoys: PackDecoy[], qualificationRun: Evaluation, qualification: QualifiedFault[], checkpoint: (score: ScoredArm) => Promise<void>): Promise<ScoredArm> {
  const run = await makeRun(sealed, path.join(directory, arm.role), arm, files);
  const controls: EvaluatedVariant[] = [];
  for (const control of sealed.definition.controls) controls.push(await checkControl(run, control.id));
  const score: ScoredArm = {
    role: arm.role, provenance: arm.provenance, metadata: arm.metadata, provenanceVerified: false,
    controls, falseRejections: failedControls(controls),
    controlErrors: controls.filter(({ error, result }) => error || !["passed", "assertion-failed"].includes(result?.status ?? "")).length, results: []
  };
  await checkpoint(score);
  for (const decoy of decoys) {
    const label = await qualifyFault(sealed, qualificationRun, decoy, qualification);
    score.results.push(await scoreFault(sealed, run, decoy, label));
    await checkpoint(score);
  }
  score.counts = countChallenges(score.results);
  return score;
}

async function compareArms(sealed: Sealed, directory: string, files: Record<string, string>, decoys: PackDecoy[], checkpoint: (qualification: QualifiedFault[], arms: ScoredArm[]) => Promise<void>) {
  const canonical = sealed.arms.find(({ role }) => role === "confam-final")!;
  const qualificationRun = await makeRun(sealed, path.join(directory, "qualification"), canonical, files);
  const canonicalControls: EvaluatedVariant[] = [];
  for (const control of sealed.definition.controls) canonicalControls.push(await checkControl({ ...qualificationRun, probes: sealed.probes }, control.id));
  if (!canonicalControls.every(correctReference)) throw new Error("Final reference controls no longer pass independent observations.");
  const qualification: QualifiedFault[] = [];
  const arms: ScoredArm[] = [];
  for (const arm of sealed.arms) {
    await scoreArm(sealed, directory, arm, files, decoys, qualificationRun, qualification, async (current) => {
      if (!arms.includes(current)) arms.push(current);
      await checkpoint(qualification, arms);
    });
    await checkpoint(qualification, arms);
  }
  return { qualification, arms };
}

async function promoteEvaluation(sealed: Sealed, directory: string, reportPath: string, packHash: string, arms: ScoredArm[]) {
  const complete = arms.every(({ counts, controlErrors }) => counts?.uncounted === 0 && controlErrors === 0);
  sealed.report.independentEvaluation = {
    evaluated: true, complete, reportPath, packHash,
    counts: arms.map(({ role, counts, falseRejections, controlErrors }) => ({ role, counts, falseRejections, controlErrors }))
  };
  sealed.report.verdict = complete
    ? "Independent evaluation completed; inspect the per-arm raw counts and surviving faults. No general correctness guarantee."
    : "Independent evaluation attempted but incomplete; uncounted faults or control execution errors remain.";
  await writeFile(path.join(directory, "challenge-report.json"), JSON.stringify(sealed.report, null, 2) + "\n");
}

// The only generic reader of a private pack. No authoring/strengthening path imports pack contents.
export async function evaluateChallengePack(directory: string, file: string, integrationFixture = false) {
  const started = Date.now();
  directory = path.resolve(directory);
  const sealed = await loadSealed(directory); // Validate freeze before opening the explicitly supplied pack.
  if (!integrationFixture && sealed.confirmation.source === "fixture") throw new Error("Scripted fixture sessions cannot receive genuine independent-evaluation claims.");
  const evaluationDirectory = path.join(directory, "evaluations", integrationFixture ? `fixture-${randomUUID()}` : "held-out");
  if (!integrationFixture) await writeFile(path.join(directory, "heldout-attempt.json"), JSON.stringify({ startedAt: new Date().toISOString() }), { flag: "wx" });
  await mkdir(evaluationDirectory, { recursive: true });
  const reportPath = path.join(evaluationDirectory, "comparison.json");
  const report: Record<string, unknown> = {
    schemaVersion: 3, status: "running", startedAt: new Date(started).toISOString(), purpose: integrationFixture ? "integration-fixture" : "held-out",
    qualification: [], arms: [], limitations: ["Raw counts on this pack only; no general correctness guarantee.", "Independent probes label faults; only workflow assertions score check detection.", "Comparator provenance is supplied and unverified; absent metadata cannot support model-performance claims."]
  };
  try {
    const loaded = await loadEvaluationPack(file, sealed.definition, sealed.probes);
    if (loaded.pack.purpose !== report.purpose) throw new Error("Pack purpose does not match the requested evaluation mode.");
    const { files, packHash } = await packFiles(sealed, loaded);
    report.packHash = packHash;
    if (!integrationFixture) await writeFile(path.join(path.dirname(directory), `.heldout-pack-${packHash}.json`), JSON.stringify({ run: directory }), { flag: "wx" });
    const { qualification, arms } = await compareArms(sealed, evaluationDirectory, files, loaded.decoys, async (qualification, arms) => {
      report.qualification = qualification; report.arms = arms;
      await writeFile(path.join(evaluationDirectory, "progress.json"), JSON.stringify(report, null, 2) + "\n");
    });
    report.qualification = qualification; report.arms = arms;
    report.status = "completed";
    await verifyEngine(sealed.seal.identity); await verifyChecks(sealed.seal.checks);
    report.finishedAt = new Date().toISOString(); report.durationMs = Date.now() - started;
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    if (!integrationFixture) await promoteEvaluation(sealed, directory, reportPath, packHash, arms);
  } catch (error) {
    report.status = "error"; report.error = errorMessage(error);
    report.finishedAt = new Date().toISOString(); report.durationMs = Date.now() - started;
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  }
  return { report, reportPath };
}
