import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ModelClient, createMetaTransport, type ModelTransport } from "../models/client.js";
import { CostLedger } from "../models/ledger.js";
import { DEFAULT_BUDGET_USD } from "../models/config.js";
import { loadSalonCase } from "../engine/salon.js";
import { readJson } from "../engine/json.js";
import { runCase } from "../engine/pipeline.js";
import { errorMessage } from "../engine/process.js";
import { materializeDecoys, sourceBundle } from "./decoys.js";
import { draftCheckPlan, draftDevelopmentDecoys, draftIntake, draftStrengthening, draftFix } from "./prompts.js";
import { intakeSchema, validateExpectations, validateIntake } from "./schemas.js";
import { confirmationSchema, contentHash, loadSession, newSessionDirectory, sessionDirectory, withSessionLock, writeArtifact, type AuthoringSession } from "./session.js";

function transportFor(session: AuthoringSession, injected?: ModelTransport): ModelTransport {
  if (injected) {
    if (injected.mode !== session.mode) throw new Error("Injected transport does not match the session mode.");
    return injected;
  }
  if (session.mode === "fixture") throw new Error("Fixture sessions require an explicitly injected fixture transport.");
  return createMetaTransport(process.env.MODEL_API_KEY ?? "");
}

function stoppedStatus(error: unknown): "error" | "budget-stopped" {
  return error instanceof Error && error.name === "BudgetExceededError" ? "budget-stopped" : "error";
}

export async function beginIntake(root: string, caseDirectory: string, budget = DEFAULT_BUDGET_USD, transport?: ModelTransport) {
  const salon = await loadSalonCase(root, caseDirectory);
  const mode = transport?.mode ?? "live";
  const { id, directory } = await newSessionDirectory(root, mode);
  const session: AuthoringSession = { schemaVersion: 1, id, caseDirectory: path.relative(root, caseDirectory), mode, startedAt: new Date().toISOString(), status: "drafting", subject: salon.subject };
  await writeArtifact(directory, "session.json", session);
  try {
    const ledger = await CostLedger.create(path.join(directory, "model-usage.json"), budget, mode);
    const client = new ModelClient(ledger, transportFor(session, transport));
    const draft = await draftIntake(client, await readFile(path.join(caseDirectory, "report.md"), "utf8"));
    await writeArtifact(directory, "intake.json", draft);
    session.draftHash = contentHash(draft);
    session.status = "awaiting-confirmation";
  } catch (error) {
    session.status = stoppedStatus(error);
    session.error = errorMessage(error);
  }
  await writeArtifact(directory, "session.json", session);
  return session;
}

export async function confirmSession(root: string, id: string, answer?: "yes" | "no", source: "developer-cli" | "fixture" = "developer-cli") {
  const directory = sessionDirectory(root, id);
  return withSessionLock(directory, async () => {
    const session = await loadSession(root, id);
    if (session.status !== "awaiting-confirmation") throw new Error("This session is not awaiting expectation confirmation.");
    if (source === "fixture" && session.mode !== "fixture") throw new Error("Scripted confirmation cannot confirm a live session.");
    const draft = intakeSchema.parse(await readJson(path.join(directory, "intake.json")));
    validateIntake(draft);
    if (contentHash(draft) !== session.draftHash) throw new Error("The intake draft changed after it was recorded; confirmation stopped.");
    if (draft.question && !answer) throw new Error("Answer the clarifying question with --answer yes or --answer no.");
    if (!draft.question && answer) throw new Error("This draft has no clarifying question to answer.");
    const expectations = [...draft.expectations];
    if (draft.question && answer === "yes") expectations.push(draft.question.proposedExpectation);
    validateExpectations(expectations);
    const confirmation = { expectations, steps: draft.steps, answer: answer ?? null, confirmedAt: new Date().toISOString(), source };
    await writeArtifact(directory, "confirmed.json", confirmation);
    session.confirmedHash = contentHash(confirmation);
    session.status = "confirmed";
    await writeArtifact(directory, "session.json", session);
    return session;
  });
}

export async function runAuthoredSession(root: string, id: string, candidate?: string, transport?: ModelTransport, builtInFixer = false) {
  if (candidate && builtInFixer) throw new Error("Choose a supplied candidate or the built-in fixer, not both.");
  const directory = sessionDirectory(root, id);
  return withSessionLock(directory, async () => {
    const session = await loadSession(root, id);
    if (session.status !== "confirmed") throw new Error("Confirm the expectations before starting this session. A session can execute only once.");
    const confirmation = confirmationSchema.parse(await readJson(path.join(directory, "confirmed.json")));
    validateExpectations(confirmation.expectations);
    if (contentHash(confirmation) !== session.confirmedHash) throw new Error("Confirmed expectations changed; execution stopped.");
    session.status = "running";
    await writeArtifact(directory, "session.json", session);
    try {
      const ledger = await CostLedger.load(path.join(directory, "model-usage.json"));
      const client = new ModelClient(ledger, transportFor(session, transport));
      const plan = await draftCheckPlan(client, confirmation.expectations);
      await writeArtifact(directory, "check-plan.json", plan);
      const caseDirectory = path.resolve(root, session.caseDirectory);
      const { report, reportPath } = await runCase(root, caseDirectory, candidate, {
        runDirectory: directory, subject: session.subject, assertions: plan.assertions,
        provenance: { mode: session.mode, sessionId: session.id }, modelUsage: () => ledger.snapshot(),
        strengthen: (request) => draftStrengthening(new ModelClient(ledger, transportFor(session, transport)), confirmation.expectations, request),
        candidateFactory: builtInFixer ? async (baseline) => {
          const patch = await draftFix(new ModelClient(ledger, transportFor(session, transport)), confirmation.expectations, await sourceBundle(baseline));
          const file = path.join(directory, "fixer-proposed.patch");
          await writeFile(file, patch);
          return file;
        } : undefined,
        async developmentDecoys(baseline) {
          const draft = await draftDevelopmentDecoys(client, await sourceBundle(baseline));
          await writeArtifact(directory, "decoy-draft.json", draft);
          return materializeDecoys(baseline, directory, draft, path.join(root, "specimens/salon/decoys/t4-swallowed-error.patch"));
        },
      });
      session.status = report.status === "completed" ? "completed" : report.status === "blocked" ? "blocked" : report.status === "needs-review" ? "needs-review" : report.status === "budget-stopped" ? "budget-stopped" : "error";
      session.reportPath = reportPath;
      if (report.error) session.error = report.error;
    } catch (error) {
      session.status = stoppedStatus(error);
      session.error = errorMessage(error);
    }
    session.finishedAt = new Date().toISOString();
    await writeArtifact(directory, "session.json", session);
    return session;
  });
}

export async function reuseConfirmedSession(root: string, parentId: string, budget = DEFAULT_BUDGET_USD) {
  const parentDirectory = sessionDirectory(root, parentId);
  return withSessionLock(parentDirectory, async () => {
    const parent = await loadSession(root, parentId);
    if (parent.status !== "completed") throw new Error("Only a completed session can supply a previously confirmed expectation set.");
    const confirmation = confirmationSchema.parse(await readJson(path.join(parentDirectory, "confirmed.json")));
    validateExpectations(confirmation.expectations);
    if (contentHash(confirmation) !== parent.confirmedHash) throw new Error("Parent confirmation changed; recheck stopped.");
    const { id, directory } = await newSessionDirectory(root, parent.mode);
    const session: AuthoringSession = {
      schemaVersion: 1, id, mode: parent.mode, parentId, caseDirectory: parent.caseDirectory,
      subject: parent.subject, status: "confirmed", startedAt: new Date().toISOString(), confirmedHash: parent.confirmedHash,
    };
    await CostLedger.create(path.join(directory, "model-usage.json"), budget, parent.mode);
    await writeArtifact(directory, "confirmed.json", confirmation);
    await writeArtifact(directory, "session.json", session);
    return session;
  });
}
