import { proposeDecoys } from "../authoring/generic-decoys.js";
import { challengeProject } from "../challenges/harness.js";
import { evaluateChallengePack } from "../challenges/evaluate-pack.js";
import { DEFAULT_BUDGET_USD } from "../models/config.js";
import { verifyProject } from "../project/verify.js";
import { proposeWorkflow } from "../authoring/generic.js";
import { checkProject } from "../project/check.js";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runCase } from "../engine/pipeline.js";
import { errorMessage } from "../engine/process.js";
import { beginIntake, confirmSession, runAuthoredSession, reuseConfirmedSession } from "../authoring/workflow.js";
import { evaluateHeldOut } from "../engine/heldout.js";
import { fixtureTransport } from "../authoring/fixture.js";
import { sessionDirectory, type AuthoringSession } from "../authoring/session.js";
import { readJson } from "../engine/json.js";
import type { RunReport } from "../engine/pipeline.js";
import { parseArguments } from "./arguments.js";

function printReport(report: RunReport, reportPath: string): void {
  if (report.provenance?.mode === "fixture") console.log("OFFLINE FIXTURE DEMO — scripted model responses and confirmation; $0 API spend.");
  console.log(`\n${report.verdict}\nEvidence: ${reportPath}`);
  if (report.client) console.log(`Client verdict (${report.client.state}): ${report.client.sentence}`);
  if (report.pendingReview) console.log(`Owner review required: ${report.pendingReview.proposalPath}`);
  if (report.status !== "completed" || report.variants.some(({ kind, outcome }) => kind === "candidate" && outcome !== "passed")) process.exitCode = 1;
}

async function printSession(root: string, session: AuthoringSession): Promise<void> {
  console.log(`Session: ${session.id}\nStatus: ${session.status}\nArtifacts: ${sessionDirectory(root, session.id)}`);
  if (session.error) { console.error(session.error); process.exitCode = 1; }
  if (session.status === "awaiting-confirmation") {
    console.log("Review intake.json. Confirm with: npm run confam -- confirm " + session.id + " --accept [--answer yes|no]");
  }
  if (session.reportPath) printReport(await readJson<RunReport>(session.reportPath), session.reportPath);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const envFile = path.join(root, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const candidate = args.candidate ? path.resolve(args.candidate) : undefined;
  if (args.command === "draft-decoys") {
    const draft = await proposeDecoys(path.resolve(args.project!), path.resolve(args.subject), path.resolve(args.registry!), args.reference!, path.join(root, "runs"), args.budget);
    console.log(`Decoy proposal requires review: ${draft.manifestPath}\nNo probes authored and no application behavior evaluated.`);
  } else if (args.command === "challenge") {
    const { report, reportPath } = await challengeProject({
      project: path.resolve(args.project!), caseFile: path.resolve(args.subject),
      workflow: path.resolve(args.workflow!), manifest: path.resolve(args.manifest!), runsDirectory: path.join(root, "runs"),
      confirmation: args.fixture ? "fixture" : "developer-cli", candidate,
      modelBudget: args.strengthen ? args.budget ?? DEFAULT_BUDGET_USD : undefined
    });
    console.log(`${args.fixture ? "FIXTURE DEVELOPMENT CHALLENGE\n" : ""}${report.verdict}\nDevelopment: ${JSON.stringify(report.development ?? null)}\nEvidence: ${reportPath}`);
    if (report.error) console.error(report.error);
    const result = report.candidate as { outcome?: string } | undefined;
    console.log(`Candidate: ${result?.outcome ?? "not evaluated"}`);
    if (report.status !== "completed" || (result && result.outcome !== "passed-checks-and-probes")) process.exitCode = 1;
  } else if (args.command === "compare") {
    const { report, reportPath } = await evaluateChallengePack(path.resolve(args.subject), path.resolve(args.pack!), args.integrationFixture);
    console.log(`${report.purpose}: ${report.status}\nEvidence: ${reportPath}`);
    for (const arm of (report.arms ?? []) as { role: string; counts: unknown; falseRejections: number }[]) console.log(`${arm.role}: ${JSON.stringify(arm.counts)}, false rejections: ${arm.falseRejections}`);
    if (report.status !== "completed") { console.error(report.error); process.exitCode = 1; }
  } else if (args.command === "verify") {
    const { report, reportPath } = await verifyProject({
      project: path.resolve(args.project!), caseFile: path.resolve(args.subject),
      workflow: path.resolve(args.workflow!), runsDirectory: path.join(root, "runs"),
      confirmation: args.fixture ? "fixture" : "developer-cli", candidate
    });
    if (args.fixture) console.log("FIXTURE VERIFICATION — scripted case/workflow and expectation confirmation; real browser execution.");
    for (const variant of report.variants) console.log(`${variant.id}: ${variant.result?.status ?? "execution-error"}${variant.result?.expectationId ? ` [${variant.result.expectationId}]` : ""}${variant.error ? ` — ${variant.error}` : ""}`);
    console.log(`${report.verdict}\nEvidence: ${reportPath}`);
    for (const limitation of report.limitations) console.log(`Limitation: ${limitation}`);
    if (report.status !== "completed" || report.candidate === "failed") process.exitCode = 1;
  } else if (args.command === "draft-workflow") {
    const draft = await proposeWorkflow(path.resolve(args.project!), path.resolve(args.subject), path.join(root, "runs"), args.budget);
    console.log(`Workflow proposal requires review: ${draft.workflowPath}\nNo expectations confirmed and no application executed.`);
  } else if (args.command === "project-check") {
    const { report, reportPath } = await checkProject(path.resolve(args.subject), path.join(root, "runs"));
    console.log(`Project ${report.project}: ${report.status}. ${report.scope}\nEvidence: ${reportPath}`);
  } else if (args.command === "run") {
    const { report, reportPath } = await runCase(root, path.resolve(args.subject), candidate);
    printReport(report, reportPath);
  } else if (args.command === "intake") {
    await printSession(root, await beginIntake(root, path.resolve(args.subject), args.budget));
  } else if (args.command === "confirm") {
    await printSession(root, await confirmSession(root, args.subject, args.answer));
  } else if (args.command === "execute") {
    await printSession(root, await runAuthoredSession(root, args.subject, candidate, undefined, args.fix));
  } else if (args.command === "recheck") {
    const session = await reuseConfirmedSession(root, args.subject, args.budget);
    await printSession(root, await runAuthoredSession(root, session.id, candidate, session.mode === "fixture" ? fixtureTransport() : undefined, args.fix));
  } else if (args.command === "heldout") {
    const { evaluation, reportPath } = await evaluateHeldOut(root, args.subject, path.resolve(args.pack!));
    console.log(`${evaluation.purpose}: ${evaluation.counts.caught} caught, ${evaluation.counts.survived} survived, ${evaluation.counts.uncounted} uncounted.\nEvidence: ${reportPath}`);
    if (evaluation.status !== "completed") { console.error(evaluation.error ?? "Evaluation incomplete."); process.exitCode = 1; }
  } else {
    console.log("OFFLINE FIXTURE DEMO — no live inference; confirmation is scripted.");
    const transport = fixtureTransport();
    const session = await beginIntake(root, path.resolve(args.subject), args.budget, transport);
    if (session.status !== "awaiting-confirmation") { await printSession(root, session); return; }
    await confirmSession(root, session.id, "yes", "fixture");
    await printSession(root, await runAuthoredSession(root, session.id, candidate, transport, args.fix));
  }
}

main().catch((error: unknown) => { console.error(errorMessage(error)); process.exitCode = 1; return; });
