import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freezeBundle, verifyChecks, type FrozenChecks } from "../engine/freeze.js";
import { readJson } from "../engine/json.js";
import { git, errorMessage } from "../engine/process.js";
import { prepareBaseline, createVariant } from "../engine/variants.js";
import { runProbes, type ProbeDefinition, type ProbeObservation } from "../probes/index.js";
import { guardPatch } from "../engine/variants.js";
import { runWorkflow, type WorkflowResult } from "../workflows/runner.js";
import { workflowSchema, validateWorkflow, type WorkflowPlan } from "../workflows/schema.js";
import { loadVerificationCase } from "./load-case.js";
import { createProjectLifecycle } from "./runtime.js";
import type { ProjectConfig } from "./config.js";
import type { CaseDefinition } from "./case.js";

interface VerificationOptions {
  project: string;
  caseFile: string;
  workflow: string;
  runsDirectory: string;
  confirmation: "developer-cli" | "fixture";
  candidate?: string;
}
export interface EvaluatedVariant {
  id: string;
  kind: "original" | "control" | "candidate";
  result?: WorkflowResult;
  error?: string;
  phase?: "prepare" | "workflow" | "probes";
  probes?: Record<string, ProbeObservation>;
}
export interface VerificationReport {
  schemaVersion: 2;
  status: "running" | "completed" | "blocked" | "error";
  project: string;
  caseId: string;
  confirmation: string;
  checks?: FrozenChecks;
  baselineRevision?: string;
  variants: EvaluatedVariant[];
  candidate?: "passed" | "failed";
  verdict: string;
  limitations: string[];
  error?: string;
}

export async function executorIdentity(): Promise<string> {
  const hash = createHash("sha256");
  for (const name of ["../workflows/runner.ts", "../workflows/schema.ts", "../workflows/actions.ts"]) {
    hash.update(await readFile(fileURLToPath(new URL(name, import.meta.url))));
  }
  return hash.digest("hex");
}

export interface Evaluation {
  baseline: string; directory: string; checks: FrozenChecks; revision: string; executor: string;
  project: ProjectConfig; definition: CaseDefinition; plan: WorkflowPlan;
  probes?: ProbeDefinition[]; referencePatch?: string;
}
export async function evaluate(run: Evaluation, id: string, kind: EvaluatedVariant["kind"], patch?: string): Promise<EvaluatedVariant> {
  const variant: EvaluatedVariant = { id, kind, phase: "prepare" };
  const directory = path.join(run.directory, "variants", id);
  const app = path.join(directory, "app");
  const lifecycle = createProjectLifecycle(app, directory, run.project.runtime);
  const abort = new AbortController();
  const verify = async () => {
    await verifyChecks(run.checks);
    if (await executorIdentity() !== run.executor) throw new Error("Workflow executor changed after freeze.");
    if ((await git(run.baseline, "rev-parse", "HEAD")).trim() !== run.revision
      || (await git(run.baseline, "status", "--porcelain")).trim()) throw new Error("Project baseline changed after freeze.");
  };
  try {
    await verify();
    await createVariant(run.baseline, app, run.referencePatch ?? patch);
    if (run.referencePatch && patch) {
      await guardPatch(app, patch);
      await git(app, "apply", "--", patch);
    }
    await lifecycle.reset();
    let server = await lifecycle.start(abort.signal);
    variant.phase = "workflow";
    variant.result = await runWorkflow(run.plan, run.definition.fixtures, server.baseUrl, path.join(directory, "evidence"), {
      async restartApp() { await verify(); server = await lifecycle.restart(abort.signal); return server.baseUrl; },
      async cancel() { abort.abort(); await lifecycle.stop(); },
    });
    if (run.probes?.length && variant.result.reached && ["passed", "assertion-failed"].includes(variant.result.status)) {
      variant.phase = "probes";
      variant.probes = await runProbes(run.probes, {
        dataDirectory: lifecycle.dataDirectory, dataPath: lifecycle.dataPath,
        baseUrl: server.baseUrl, fixtures: run.definition.fixtures, signal: abort.signal
      });
    }
    await verify();
  } catch (error) { variant.error = errorMessage(error); }
  finally { await lifecycle.stop(); }
  return variant;
}

type LoadedCase = Awaited<ReturnType<typeof loadVerificationCase>>;
function initialReport(loaded: LoadedCase, confirmation: VerificationOptions["confirmation"]): VerificationReport {
  const report: VerificationReport = {
    schemaVersion: 2, status: "running", project: loaded.project.config.id,
    caseId: loaded.definition.id, confirmation: confirmation, variants: [], verdict: "Verification in progress.",
    limitations: ["No independently qualified decoy challenges or held-out evaluation performed.",
      "Evidence applies only to the confirmed expectations, fixtures, and recorded runtime.",
      "Local processes are not a hostile-code sandbox."]
  };
  if (loaded.definition.recording) report.limitations.push("The supplied recording was not interpreted; this run uses the text report and reviewed workflow only.");
  if (!loaded.controls.length) report.limitations.push("No independently correct controls supplied; false-rejection calibration is unavailable.");
  if (confirmation === "fixture") report.limitations.push("FIXTURE: workflow and expectation confirmation are scripted sample inputs.");
  return report;
}
async function saveReport(file: string, report: VerificationReport): Promise<void> {
  await writeFile(file, JSON.stringify(report, null, 2) + "\n");
}
function gateFailure(report: VerificationReport, definition: CaseDefinition): string | undefined {
  const originalVariant = report.variants[0];
  const original = originalVariant?.result;
  const reproduced = !originalVariant?.error && original?.status === "assertion-failed" && original.reached
    && definition.reproductionTargets.includes(original.expectationId ?? "");
  if (!reproduced) return "The reported behavior was not reproduced on its designated expectation; no candidate verdict.";
  const controlsPassed = report.variants.filter(({ kind }) => kind === "control").every(({ result, error }) => !error && result?.status === "passed");
  if (!controlsPassed) return "A supplied correct control did not pass; no candidate verdict.";
  return undefined;
}
async function evaluateCandidate(run: Evaluation, file: string | undefined, report: VerificationReport): Promise<void> {
  if (!file) return;
  if (!(await lstat(file)).isFile()) throw new Error("Candidate patch must be a regular file.");
  const patch = path.join(run.directory, "candidate.patch");
  await writeFile(patch, await readFile(file), { flag: "wx" });
  const candidate = await evaluate(run, "candidate", "candidate", patch);
  report.variants.push(candidate);
  if (candidate.error || !["passed", "assertion-failed"].includes(candidate.result?.status ?? "")) {
    throw new Error(`Candidate evaluation incomplete: ${candidate.error ?? candidate.result?.error ?? "workflow did not complete"}`);
  }
  report.candidate = candidate.result?.status === "passed" ? "passed" : "failed";
}

export async function verifyProject(options: VerificationOptions) {
  const loaded = await loadVerificationCase(options.project, options.caseFile);
  if (options.confirmation === "fixture" && loaded.definition.purpose !== "fixture") throw new Error("Scripted confirmation requires an explicitly labelled fixture case.");
  if (!(await lstat(options.workflow)).isFile()) throw new Error("Workflow must be a regular file.");
  const plan = validateWorkflow(workflowSchema.parse(await readJson(options.workflow)), loaded.definition.expectations,
    loaded.definition.fixtures, loaded.project.config.runtime);
  const directory = path.resolve(options.runsDirectory, `verify-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const reportPath = path.join(directory, "verification.json");
  const report = initialReport(loaded, options.confirmation);
  await saveReport(reportPath, report);
  try {
    const baseline = await prepareBaseline(loaded.project.root, directory, loaded.project.config);
    const revision = (await git(baseline, "rev-parse", "HEAD")).trim();
    const executor = await executorIdentity();
    const files: Record<string, string> = {
      "case.json": JSON.stringify(loaded.definition), "workflow.json": JSON.stringify(plan),
      "project.json": JSON.stringify(loaded.project.config), "report.md": loaded.report,
      "confirmation.json": JSON.stringify({ source: options.confirmation, confirmedAt: new Date().toISOString(), expectations: loaded.definition.expectations }),
      "execution.json": JSON.stringify({ revision, executor }),
    };
    for (const control of loaded.controls) files[`control-${control.id}.patch`] = control.contents;
    const checks = await freezeBundle(path.join(directory, "checks"), files);
    report.checks = checks; report.baselineRevision = revision;
    const run: Evaluation = { baseline, directory, checks, revision, executor, project: loaded.project.config, definition: loaded.definition, plan };
    report.variants.push(await evaluate(run, "original", "original"));
    for (const control of loaded.controls) report.variants.push(await evaluate(run, `control-${control.id}`, "control", path.join(checks.directory, `control-${control.id}.patch`)));
    const blocked = gateFailure(report, loaded.definition);
    if (blocked) {
      report.status = "blocked";
      report.verdict = blocked;
    } else {
      await evaluateCandidate(run, options.candidate, report);
      report.status = "completed";
      report.verdict = report.candidate ? `Candidate ${report.candidate} the listed checks under the recorded conditions.`
        : "The reported behavior was reproduced; no candidate repair was evaluated.";
    }
    await verifyChecks(checks);
  } catch (error) {
    report.status = "error"; report.error = errorMessage(error); report.verdict = "Verification incomplete; no completed repair verdict.";
    delete report.candidate;
  } finally { await saveReport(reportPath, report); }
  return { report, reportPath };
}
