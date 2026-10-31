import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { proposeFix } from "../authoring/generic-fixer.js";
import { proposeGaps } from "../authoring/generic-gaps.js";
import { guardPatch, prepareBaseline } from "../engine/variants.js";
import { git } from "../engine/process.js";
import type { ModelTransport } from "../models/client.js";
import { NANOUNITS_PER_USD } from "../models/config.js";
import { loadProjectConfig } from "../project/config.js";
import { loadVerificationCase } from "../project/load-case.js";
import { PROJECT_SNAPSHOT } from "../project/snapshot.js";
import { verifyProject } from "../project/verify.js";
import type { WorkflowResult } from "../workflows/runner.js";

// A repair session alternates the two models under the developer's control: Muse Wonder proposes a fix, Confam runs
// every confirmed case against it, Wonder gets one more attempt with the unmet expectations, and a passing fix goes to
// Muse Spark for a gap review. Every model call waits for the developer to approve its exact export, so the session
// stops after writing each preview and resumes with repair-continue.

const relative = z.string().min(1).max(500);
const suiteSchema = z.strictObject({
  schemaVersion: z.literal(1),
  // The project whose configured source files the fixer may change.
  project: relative,
  cases: z.array(z.strictObject({ case: relative, workflow: relative, project: relative.optional() })).min(1).max(10),
  rounds: z.number().int().min(1).max(2).default(2),
});
type CaseOutcome = {
  caseId: string; expectationIds: string[]; outcome: "passed" | "failed" | "incomplete"; unmet: string[];
  evidence: string; mode: "candidate" | "regression"; error?: string;
};
type Feedback = { previousPatch: string; unmetExpectations: { id: string; statement: string }[] };
export interface RepairState {
  schemaVersion: 1; id: string; suite: string; project: string; status: "awaiting-approval" | "finished"; maxRounds: number;
  pending: { stage: "fixer" | "gaps"; round: number; exportPath: string; exportHash: string; feedback?: Feedback } | null;
  rounds: { round: number; fixDirectory: string; patchPath: string; patchHash: string; results: CaseOutcome[]; earlierResults?: CaseOutcome[][] }[];
  attempts?: { round: number; at: string; error: string }[];
  review: { directory: string; proposalPath: string } | null;
  outcome: null | "repaired-and-reviewed" | "not-repaired" | "incomplete"; spendUsd: number;
}
export interface RepairOptions { budget?: number; transport?: ModelTransport }

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

async function readJsonFile(file: string, label: string): Promise<unknown> {
  const text = await readFile(file, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The ${label} is not valid JSON: ${file}`);
  }
}

async function loadSuite(suiteFile: string) {
  const suite = suiteSchema.parse(await readJsonFile(suiteFile, "repair suite"));
  const base = path.dirname(suiteFile);
  const project = path.resolve(base, suite.project);
  const cases = suite.cases.map((entry) => ({
    caseFile: path.resolve(base, entry.case), workflow: path.resolve(base, entry.workflow),
    project: path.resolve(base, entry.project ?? suite.project),
  }));
  return { suite, project, cases };
}

// The models see every confirmed expectation in the suite at once; this merged case is model context only and is never run.
async function writeMergedCase(sessionDirectory: string, suiteFile: string) {
  const { project, cases } = await loadSuite(suiteFile);
  const { config } = await loadProjectConfig(project);
  const expectations = new Map<string, { id: string; statement: string; provenance: string }>();
  const fixtures: Record<string, unknown> = {};
  const reports: string[] = [];
  for (const entry of cases) {
    const loaded = await loadVerificationCase(entry.project, entry.caseFile);
    if (loaded.definition.controls.length) throw new Error(`Repair suites take cases without controls: ${loaded.definition.id}`);
    for (const expectation of loaded.definition.expectations) {
      const known = expectations.get(expectation.id);
      if (known && known.statement !== expectation.statement) throw new Error(`Conflicting expectation ${expectation.id} in the suite.`);
      expectations.set(expectation.id, expectation);
    }
    for (const [key, value] of Object.entries(loaded.definition.fixtures)) {
      if (key in fixtures && JSON.stringify(fixtures[key]) !== JSON.stringify(value)) throw new Error(`Conflicting fixture ${key} in the suite.`);
      fixtures[key] = value;
    }
    reports.push(`## ${loaded.definition.id}\n\n${loaded.report.trim()}`);
  }
  const directory = path.join(sessionDirectory, "merged");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "report.md"), reports.join("\n\n") + "\n");
  const ids = [...expectations.keys()];
  const caseFile = path.join(directory, "case.json");
  await writeFile(caseFile, JSON.stringify({
    schemaVersion: 1, id: "repairSuite", projectId: config.id, report: "report.md", fixtures,
    expectations: [...expectations.values()], reproductionTargets: [ids[0]], controls: [], mode: "verification", purpose: "verification",
  }, null, 2) + "\n");
  return caseFile;
}

async function saveState(sessionDirectory: string, state: RepairState) {
  state.spendUsd = await spend(state);
  const file = path.join(sessionDirectory, "state.json");
  await writeFile(`${file}.tmp`, JSON.stringify(state, null, 2) + "\n");
  await rename(`${file}.tmp`, file);
}

async function spend(state: RepairState) {
  const directories = [...state.rounds.map(({ fixDirectory }) => fixDirectory), ...(state.review ? [state.review.directory] : [])];
  let nanounits = 0;
  for (const directory of directories) {
    try {
      const ledger = await readJsonFile(path.join(directory, "model-usage.json"), "model ledger") as { entries: { costNanounits?: number }[] };
      for (const entry of ledger.entries) nanounits += entry.costNanounits ?? 0;
    } catch { /* a preview or failed call has no settled usage */ }
  }
  return nanounits / NANOUNITS_PER_USD;
}

async function previewFix(sessionDirectory: string, state: RepairState, round: number, feedback?: Feedback) {
  const caseFile = path.join(sessionDirectory, "merged", "case.json");
  const draft = await proposeFix(state.project, caseFile, sessionDirectory, { preview: true, feedback });
  state.pending = { stage: "fixer", round, exportPath: draft.exportPath, exportHash: sha256(await readFile(draft.exportPath)), feedback };
}

export async function startRepair(suiteFile: string, runsDirectory: string): Promise<{ sessionDirectory: string; state: RepairState }> {
  const suitePath = path.resolve(suiteFile);
  const { suite, project } = await loadSuite(suitePath);
  const id = randomUUID();
  const sessionDirectory = path.resolve(runsDirectory, `repair-${id}`);
  await mkdir(sessionDirectory, { recursive: true });
  await writeMergedCase(sessionDirectory, suitePath);
  const state: RepairState = {
    schemaVersion: 1, id, suite: suitePath, project, status: "awaiting-approval", maxRounds: suite.rounds,
    pending: null, rounds: [], review: null, outcome: null, spendUsd: 0,
  };
  await previewFix(sessionDirectory, state, 1);
  await saveState(sessionDirectory, state);
  return { sessionDirectory, state };
}

function unmetIds(result: WorkflowResult | undefined) {
  return [...new Set((result?.assertions ?? []).filter(({ passed }) => !passed).map(({ expectationId }) => expectationId))];
}

// A case that reproduces on the original gets an ordinary candidate verdict. A case that already passes on the original
// (a regression guard) is run on a copy of the project with the candidate applied, where the "original" variant is the candidate.
async function evaluateCase(sessionDirectory: string, round: number, index: number, entry: { caseFile: string; workflow: string; project: string }, patch: string): Promise<CaseOutcome> {
  const loaded = await loadVerificationCase(entry.project, entry.caseFile);
  const base = { caseId: loaded.definition.id, expectationIds: loaded.definition.expectations.map(({ id }) => id) };
  const runsDirectory = path.join(sessionDirectory, "runs");
  try {
    const verified = await verifyProject({ project: entry.project, caseFile: entry.caseFile, workflow: entry.workflow, runsDirectory, confirmation: "developer-cli", candidate: patch });
    const candidate = verified.report.variants.find(({ kind }) => kind === "candidate");
    if (verified.report.candidate) {
      return { ...base, outcome: verified.report.candidate, unmet: unmetIds(candidate?.result), evidence: path.dirname(verified.reportPath), mode: "candidate" };
    }
    const original = verified.report.variants.find(({ kind }) => kind === "original");
    if (original?.result?.status !== "passed") {
      return { ...base, outcome: "incomplete", unmet: [], evidence: path.dirname(verified.reportPath), mode: "candidate", error: verified.report.error ?? verified.report.verdict };
    }
    const { config, root } = await loadProjectConfig(entry.project);
    // The same filtered, versioned copy the fixer works on, so the patch is guarded and applied exactly as for a candidate.
    const copyDirectory = path.join(sessionDirectory, `patched-r${round}-c${index}-${randomUUID().slice(0, 8)}`);
    const patchedRoot = await prepareBaseline(root, copyDirectory, config);
    await guardPatch(patchedRoot, patch);
    await git(patchedRoot, "apply", "--", patch);
    // Verification snapshots this copy again, so it must look like an ordinary project root.
    await rm(path.join(patchedRoot, PROJECT_SNAPSHOT));
    await rm(path.join(patchedRoot, ".git"), { recursive: true, force: true });
    const derivedProject = path.join(copyDirectory, "project.json");
    await writeFile(derivedProject, JSON.stringify({ ...config, root: path.basename(patchedRoot) }, null, 2) + "\n");
    const regression = await verifyProject({ project: derivedProject, caseFile: entry.caseFile, workflow: entry.workflow, runsDirectory, confirmation: "developer-cli" });
    const patched = regression.report.variants.find(({ kind }) => kind === "original");
    const status = patched?.result?.status;
    return {
      ...base, outcome: status === "passed" ? "passed" : status === "assertion-failed" ? "failed" : "incomplete",
      unmet: unmetIds(patched?.result), evidence: path.dirname(regression.reportPath), mode: "regression",
      ...(status === "passed" || status === "assertion-failed" ? {} : { error: patched?.error ?? regression.report.error ?? regression.report.verdict }),
    };
  } catch (error) {
    return { ...base, outcome: "incomplete", unmet: [], evidence: runsDirectory, mode: "candidate", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function readRepair(sessionDirectory: string): Promise<RepairState> {
  return await readJsonFile(path.join(sessionDirectory, "state.json"), "repair session") as RepairState;
}

export async function continueRepair(sessionDirectory: string, approvedExport: string, options: RepairOptions = {}): Promise<RepairState> {
  const state = await readRepair(sessionDirectory);
  if (state.status !== "awaiting-approval" || !state.pending) throw new Error("This repair session is not waiting for an approval.");
  const pending = state.pending;
  if (sha256(await readFile(approvedExport)) !== pending.exportHash) throw new Error("The approved file is not the pending export. Review the pending export before continuing.");
  const caseFile = path.join(sessionDirectory, "merged", "case.json");
  if (pending.stage === "gaps") {
    const last = state.rounds.at(-1)!;
    const review = await proposeGaps(state.project, caseFile, path.dirname(sessionDirectory), { approvedExport, candidate: last.patchPath, budget: options.budget, transport: options.transport });
    Object.assign(state, { review: { directory: review.directory, proposalPath: review.proposalPath! }, pending: null, status: "finished", outcome: "repaired-and-reviewed" });
    await saveState(sessionDirectory, state);
    return state;
  }
  let draft: Awaited<ReturnType<typeof proposeFix>>;
  try {
    draft = await proposeFix(state.project, caseFile, sessionDirectory, { approvedExport, feedback: pending.feedback, budget: options.budget, transport: options.transport });
  } catch (error) {
    // A reply that is not a usable patch is recorded; sending the same export again needs a fresh approval.
    state.attempts = [...(state.attempts ?? []), { round: pending.round, at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }];
    await saveState(sessionDirectory, state);
    throw error;
  }
  const patchPath = draft.patchPath!;
  const results = await evaluateSuite(sessionDirectory, state, pending.round, patchPath);
  state.rounds.push({ round: pending.round, fixDirectory: draft.directory, patchPath, patchHash: sha256(await readFile(patchPath)), results });
  state.pending = null;
  await advance(sessionDirectory, state, pending.round, patchPath, results);
  return state;
}

async function evaluateSuite(sessionDirectory: string, state: RepairState, round: number, patchPath: string) {
  const { cases } = await loadSuite(state.suite);
  const results: CaseOutcome[] = [];
  for (const [index, entry] of cases.entries()) results.push(await evaluateCase(sessionDirectory, round, index, entry, patchPath));
  return results;
}

// Re-runs every case on the last fix after an execution error, without any model call. Earlier results are kept.
export async function recheckRepair(sessionDirectory: string): Promise<RepairState> {
  const state = await readRepair(sessionDirectory);
  const last = state.rounds.at(-1);
  if (state.outcome !== "incomplete" || !last) throw new Error("Only a session that ended incomplete can be rechecked.");
  last.earlierResults = [...(last.earlierResults ?? []), last.results];
  last.results = await evaluateSuite(sessionDirectory, state, last.round, last.patchPath);
  Object.assign(state, { status: "awaiting-approval", outcome: null });
  await advance(sessionDirectory, state, last.round, last.patchPath, last.results);
  return state;
}

async function advance(sessionDirectory: string, state: RepairState, round: number, patchPath: string, results: CaseOutcome[]) {
  const caseFile = path.join(sessionDirectory, "merged", "case.json");
  if (results.some(({ outcome }) => outcome === "incomplete")) {
    Object.assign(state, { status: "finished", outcome: "incomplete" });
  } else if (results.every(({ outcome }) => outcome === "passed")) {
    // Gap reviews sit beside other proposals in the runs folder, so the gap review page lists them for confirmation.
    const review = await proposeGaps(state.project, caseFile, path.dirname(sessionDirectory), { preview: true, candidate: patchPath });
    state.pending = { stage: "gaps", round, exportPath: review.exportPath, exportHash: sha256(await readFile(review.exportPath)) };
  } else if (round < state.maxRounds) {
    const merged = await loadVerificationCase(state.project, caseFile);
    const unmet = new Set(results.flatMap(({ unmet: ids }) => ids));
    await previewFix(sessionDirectory, state, round + 1, {
      previousPatch: await readFile(patchPath, "utf8"),
      unmetExpectations: merged.definition.expectations.filter(({ id }) => unmet.has(id)).map(({ id, statement }) => ({ id, statement })),
    });
  } else {
    Object.assign(state, { status: "finished", outcome: "not-repaired" });
  }
  await saveState(sessionDirectory, state);
}
