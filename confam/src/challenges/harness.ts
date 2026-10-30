import { pacingLimitations } from "../workflows/pacing.js";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { modelStrengthener } from "../authoring/challenge.js";
import { budgetNanounits } from "../models/config.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { freezeBundle, verifyChecks, type FrozenChecks } from "../engine/freeze.js";
import { git, errorMessage } from "../engine/process.js";
import { prepareBaseline } from "../engine/variants.js";
import { evaluate, executorIdentity, type Evaluation, type EvaluatedVariant } from "../project/verify.js";
import { loadVerificationCase } from "../project/load-case.js";
import { validateWorkflow, type WorkflowPlan } from "../workflows/schema.js";
import { readJson } from "../engine/json.js";
import { loadChallengeManifest } from "./load.js";
import { classifyChallenge, countChallenges } from "./classify.js";
import { engineIdentity } from "./identity.js";
import { evaluateVersions, type VersionOptions, type WorkflowVersion } from "./versions.js";
import type { Decoy, ComparatorMetadata } from "./schema.js";

type Loaded = Awaited<ReturnType<typeof loadVerificationCase>>;
export interface Arm { role: "existing" | "direct-ai" | "confam-v1" | "confam-final"; provenance: string; plan: WorkflowPlan; metadata?: ComparatorMetadata; }
export interface ChallengeResult { id: string; outcome: ReturnType<typeof classifyChallenge>; variant: EvaluatedVariant; oracleOnlyDetected: boolean; }
export interface ChallengeOptions {
  project: string; caseFile: string; workflow: string; manifest: string; runsDirectory: string;
  confirmation: "developer-cli" | "fixture"; candidate?: string;
  strengthen?: VersionOptions["strengthen"];
  modelBudget?: number;
}
export const sealSchema = z.strictObject({
  schemaVersion: z.literal(3),
  checks: z.strictObject({ directory: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  revision: z.string().regex(/^[a-f0-9]{40,64}$/), identity: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ChallengeSeal = z.infer<typeof sealSchema>;

export async function verifyEngine(identity: string) {
  if (await engineIdentity() !== identity) throw new Error("Trusted engine/runtime/dependency identity changed; use the original implementation for this sealed run.");
}
export function correctReference(variant: EvaluatedVariant | undefined) {
  return Boolean(variant) && !variant?.error && variant?.result?.status === "passed" && Object.values(variant?.probes ?? {}).every(({ holds, error }) => holds && !error);
}
export function reproductionPassed(variant: EvaluatedVariant | undefined, loaded: Loaded) {
  return !variant?.error && variant?.result?.status === "assertion-failed" && variant.result.reached
    && loaded.definition.reproductionTargets.includes(variant.result.expectationId ?? "");
}
export function armPlan(plan: WorkflowPlan, loaded: Loaded) {
  const ids = new Set(plan.steps.filter((step) => step.action === "assert").map((step) => step.expectationId));
  if ([...ids].some((id) => !loaded.definition.expectations.some((expectation) => expectation.id === id))) throw new Error("Comparator uses an unknown expectation ID.");
  // Preserve missing coverage and false rejections; never repair a comparison arm.
  return validateWorkflow(plan, loaded.definition.expectations.filter(({ id }) => ids.has(id)), loaded.definition.fixtures, loaded.project.config.runtime);
}
function frozenFiles(loaded: Loaded, manifest: Awaited<ReturnType<typeof loadChallengeManifest>>, confirmation: string) {
  const files: Record<string, string> = {
    "case.json": JSON.stringify(loaded.definition), "project.json": JSON.stringify(loaded.project.config), "report.md": loaded.report,
    "probes.json": JSON.stringify(manifest.manifest.probes), "manifest.json": JSON.stringify(manifest.manifest),
    "confirmation.json": JSON.stringify({ source: confirmation, reviewScope: "Case expectations, workflow, source policy, probes and decoy requirements; definitions must establish the declared violation.", expectations: loaded.definition.expectations, at: new Date().toISOString() }),
  };
  for (const control of loaded.controls) files[`control-${control.id}.patch`] = control.contents;
  for (const decoy of manifest.decoys) files[`decoy-${decoy.id}.patch`] = decoy.contents;
  return files;
}
export async function evaluateDecoy(run: Evaluation, decoy: Decoy, id: string, checks: FrozenChecks): Promise<ChallengeResult> {
  const variant = await evaluate({ ...run, referencePatch: path.join(checks.directory, `control-${decoy.baseControl}.patch`) }, id, "candidate", path.join(checks.directory, `decoy-${decoy.id}.patch`));
  const outcome = classifyChallenge(decoy, variant);
  return { id: decoy.id, outcome, variant, oracleOnlyDetected: outcome === "survived" };
}
export function referenceFor(decoy: Decoy, controls: EvaluatedVariant[], definition: Loaded["definition"]) {
  const index = definition.controls.findIndex(({ id }) => id === decoy.baseControl);
  return correctReference(controls[index]);
}

function candidateEvidence(variant: EvaluatedVariant) {
  const checks = variant.result?.status;
  const observations = Object.values(variant.probes ?? {});
  const probeError = observations.some(({ error }) => Boolean(error));
  const contradicted = observations.some(({ holds }) => !holds);
  let outcome = "incomplete";
  if (!variant.error && !probeError) {
    if (checks === "assertion-failed") outcome = "failed-checks";
    else if (checks === "passed") outcome = contradicted ? "failed-probes" : "passed-checks-and-probes";
  }
  return { variant, outcome, checkDetection: !variant.error && checks === "assertion-failed", oracleOnlyDetection: !variant.error && checks === "passed" && contradicted && !probeError };
}
function selectVerifier(options: ChallengeOptions, directory: string) {
  if (options.strengthen && options.modelBudget !== undefined) throw new Error("Choose a supplied verifier or model verifier, not both.");
  if (options.modelBudget === undefined) return undefined;
  budgetNanounits(options.modelBudget);
  return modelStrengthener(directory, options.modelBudget);
}

async function candidateReport(run: Evaluation, file: string | undefined, controlsDirectory: string) {
  if (!file) return undefined;
  if (!(await lstat(file)).isFile()) throw new Error("Candidate patch must be a regular file.");
  const patch = path.join(controlsDirectory, "candidate.patch");
  await writeFile(patch, await readFile(file), { flag: "wx" });
  const variant = await evaluate(run, "candidate", "candidate", patch);
  return candidateEvidence(variant);
}

interface ChallengeContext {
  baseline: string; revision: string; identity: string; executor: string; directory: string;
  files: Record<string, string>; loaded: Loaded; manifest: Awaited<ReturnType<typeof loadChallengeManifest>>;
  records: { checks: FrozenChecks; run: Evaluation; decoys: ChallengeResult[]; }[];
}
async function evaluateVersion(context: ChallengeContext, plan: WorkflowPlan, version: number) {
  const { baseline, revision, identity, executor, directory, files, loaded, manifest, records } = context;
  validateWorkflow(plan, loaded.definition.expectations, loaded.definition.fixtures, loaded.project.config.runtime);
  const checks = await freezeBundle(path.join(directory, "versions", `v${version}`, "checks"), { ...files, "workflow.json": JSON.stringify(plan), "identity.json": JSON.stringify({ revision, identity, executor }) });
  const run: Evaluation = {
    baseline, directory: path.join(directory, "versions", `v${version}`), checks, revision, executor,
    project: loaded.project.config, definition: loaded.definition, plan, probes: manifest.manifest.probes
  };
  await verifyEngine(identity);
  const original = await evaluate(run, "original", "original");
  const controls: EvaluatedVariant[] = [];
  for (const control of loaded.controls) controls.push(await evaluate(run, `control-${control.id}`, "control", path.join(checks.directory, `control-${control.id}.patch`)));
  const gatePassed = Boolean(reproductionPassed(original, loaded) && controls.every(correctReference));
  const decoys: ChallengeResult[] = [];
  if (gatePassed) for (const decoy of manifest.decoys) {
    if (!referenceFor(decoy, controls, loaded.definition)) throw new Error("A decoy base was not confirmed correct.");
    decoys.push(await evaluateDecoy(run, decoy, `decoy-${decoy.id}`, checks));
  }
  await verifyEngine(identity);
  records.push({ checks, run, decoys });
  return {
    gatePassed, results: { original, controls, decoys, counts: countChallenges(decoys) },
    survivors: decoys.filter(({ outcome }) => outcome === "survived").map((result) => ({
      id: result.id,
      violation: manifest.decoys.find(({ id }) => id === result.id)!.violation,
      patch: manifest.decoys.find(({ id }) => id === result.id)!.contents, observations: result.variant.probes
    }))
  };
}
async function saveReport(file: string, report: Record<string, unknown>) {
  await writeFile(file, JSON.stringify(report, null, 2) + "\n");
}

async function completeRun(context: ChallengeContext, versions: Awaited<ReturnType<typeof evaluateVersions>>, comparators: Arm[], report: Record<string, unknown>, options: ChallengeOptions) {
  const { records, directory, files, revision, identity, executor } = context;
  const initial = versions.versions[0]!.plan;
  const last = records.at(-1)!;
  const final = versions.versions.at(-1)!.plan;
  const arms: Arm[] = [...comparators, { role: "confam-v1", provenance: "Initial workflow, before development feedback.", plan: initial },
  { role: "confam-final", provenance: `Final workflow after ${versions.rounds} strengthening rounds.`, plan: final }];
  const checks = await freezeBundle(path.join(directory, "seal"), { ...files, "arms.json": JSON.stringify(arms), "identity.json": JSON.stringify({ revision, identity, executor }) });
  const seal: ChallengeSeal = { schemaVersion: 3, checks, revision, identity };
  await writeFile(path.join(directory, "challenge-seal.json"), JSON.stringify(seal, null, 2) + "\n", { flag: "wx" });
  report.seal = seal; report.absentComparators = ["existing", "direct-ai"].filter((role) => !arms.some((arm) => arm.role === role));
  report.development = countChallenges(last.decoys);
  report.candidate = await candidateReport({ ...last.run, directory: path.join(directory, "candidate-evaluation"), checks }, options.candidate, directory);
  report.status = "completed";
  report.verdict = "Development challenges completed; independent evaluation remains pending. Candidate and check-strength evidence are separate.";
  await verifyEngine(identity); await verifyChecks(checks);
}

export async function challengeProject(options: ChallengeOptions) {
  const started = Date.now();
  const loaded = await loadVerificationCase(options.project, options.caseFile);
  if (options.confirmation === "fixture" && loaded.definition.purpose !== "fixture") throw new Error("Scripted confirmation requires a labelled fixture case.");
  const manifest = await loadChallengeManifest(options.manifest, loaded.definition);
  const initial = validateWorkflow(await readJson(options.workflow), loaded.definition.expectations, loaded.definition.fixtures, loaded.project.config.runtime);
  const comparators: Arm[] = manifest.comparators.map((arm) => ({ role: arm.role, provenance: arm.provenance, metadata: arm.metadata, plan: armPlan(arm.plan, loaded) }));
  const directory = path.resolve(options.runsDirectory, `challenge-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const reportPath = path.join(directory, "challenge-report.json");
  const report: Record<string, unknown> = {
    schemaVersion: 3, status: "running", startedAt: new Date(started).toISOString(), caseId: loaded.definition.id, project: loaded.project.config.id,
    purpose: "development", confirmation: options.confirmation, independentEvaluation: { evaluated: false },
    comparatorProvenance: "Supplied role labels and metadata are unverified; no model-performance comparison can be inferred from a role name alone.",
    limitations: ["Development results are not independent evaluation.", "Missing comparator roles are absent, not invented baselines.", "Local execution is not a hostile-code sandbox.", "Fault qualification assumes reviewed probe requirements correctly establish the declared violation.", ...pacingLimitations()]
  };
  await saveReport(reportPath, report);
  let verifier: ReturnType<typeof modelStrengthener> | undefined;
  try {
    const baseline = await prepareBaseline(loaded.project.root, directory, loaded.project.config);
    const revision = (await git(baseline, "rev-parse", "HEAD")).trim();
    const identity = await engineIdentity();
    const executor = await executorIdentity();
    const files = frozenFiles(loaded, manifest, options.confirmation);
    const records: ChallengeContext["records"] = [];
    const context: ChallengeContext = { baseline, revision, identity, executor, directory, files, loaded, manifest, records };
    verifier = selectVerifier(options, directory);
    const versions = await evaluateVersions({
      initial, strengthen: options.strengthen ?? verifier?.strengthen,
      evaluate: (plan, version) => evaluateVersion(context, plan, version),
      async preserve(version) { await saveVersion(directory, version); },
      async proposal(round, proposal) { await writeFile(path.join(directory, `proposal-${round}.json`), JSON.stringify(proposal, null, 2) + "\n", { flag: "wx" }); },
    });
    report.versions = versions;
    if (versions.status !== "ready") {
      report.status = versions.status; report.verdict = "No final freeze: reproduction/control gate or expectation review is unresolved.";
    } else {
      await completeRun(context, versions, comparators, report, options);
    }
  } catch (error) { report.status = error instanceof Error && error.name === "BudgetExceededError" ? "budget-stopped" : "error"; report.error = errorMessage(error); report.verdict = "Challenge run incomplete; no completed verification claim."; }
  finally {
    report.finishedAt = new Date().toISOString(); report.durationMs = Date.now() - started;
    report.modelUsage = verifier?.usage() ?? { estimatedSpendUsd: 0, note: "No live model verifier configured." };
    await saveReport(reportPath, report);
  }
  return { report, reportPath };
}
async function saveVersion(directory: string, version: WorkflowVersion) {
  await writeFile(path.join(directory, `version-${version.version}.json`), JSON.stringify(version, null, 2) + "\n", { flag: "wx" });
}
