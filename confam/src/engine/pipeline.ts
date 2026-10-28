import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { BookingSubject, CheckDeclaration, VariantSpec } from "./contracts.js";
import { evaluateVariant } from "./evaluate.js";
import { verifyChecks } from "./freeze.js";
import { errorMessage } from "./process.js";
import { loadSalonCase } from "./salon.js";
import { prepareBaseline } from "./variants.js";
import { evaluateCheckVersions, type StrengtheningProposal, type StrengtheningRequest } from "./check-versions.js";
import { sealFinalChecks } from "./final-freeze.js";
import { clientVerdict, countDecoys, evidenceSummary } from "./report.js";
import type { RunReport } from "./run-report.js";
export type { RunReport } from "./run-report.js";

export interface RunOptions {
  runDirectory?: string;
  subject?: BookingSubject;
  assertions?: CheckDeclaration[];
  developmentDecoys?: (baseline: string) => Promise<VariantSpec[]>;
  strengthen?: (request: StrengtheningRequest) => Promise<StrengtheningProposal>;
  candidateFactory?: (baseline: string) => Promise<string>;
  provenance?: RunReport["provenance"];
  modelUsage?: () => unknown;
}

export async function runCase(root: string, caseDirectory: string, candidate?: string, options: RunOptions = {}): Promise<{ report: RunReport; reportPath: string; }> {
  const started = Date.now();
  const runDirectory = options.runDirectory ?? path.join(root, "runs", `${new Date(started).toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
  const reportPath = path.join(runDirectory, "manifest.json");
  await mkdir(runDirectory, { recursive: true });
  const report: RunReport = {
    schemaVersion: 1, id: path.basename(runDirectory), case: path.relative(root, caseDirectory), startedAt: new Date(started).toISOString(),
    status: "running", stage: "prepare", variants: [], checkVersions: [],
    development: { caught: 0, survived: 0, uncounted: 0, total: 0 }, heldOut: { evaluated: false },
    verdict: "Run in progress.", provenance: options.provenance,
    limitations: [
      "Held-out evaluation is pending; no final claim about independent evaluation is available.",
      "One salon case, desktop Chromium, and one booking time; this is evidence for those conditions only.",
      "Variants use local processes and Git worktrees, not a security sandbox for untrusted code.",
      options.assertions?.some(({ expectationId }) => expectationId === "E4") ? "Server restart is included in confirmed E4 checks." : "Server restart is an oracle observation, not a confirmed browser expectation.",
    ],
  };
  if (options.provenance?.mode === "fixture") report.limitations.push("OFFLINE FIXTURE DEMO: model responses and confirmation are scripted; API spend is zero.");
  if (options.provenance) report.limitations.push("Declarative checks use the trusted salon workflow. T1/T3 use model edits; T4 uses a curated failing-insert mutation.");
  const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  await save();
  try {
    const salon = await loadSalonCase(root, caseDirectory);
    const subject = options.subject ?? salon.subject;
    const baseline = await prepareBaseline(salon.app, runDirectory);
    const versions = await evaluateCheckVersions({
      directory: runDirectory, source: fileURLToPath(new URL("./salon-checks.ts", import.meta.url)), subject, assertions: options.assertions,
      controls: salon.controls, strengthen: options.strengthen,
      async decoys() {
        report.stage = "development-authoring";
        await save();
        const specs = options.developmentDecoys ? await options.developmentDecoys(baseline) : salon.decoys;
        await mkdir(path.join(runDirectory, "patches"), { recursive: true });
        const archived: VariantSpec[] = [];
        for (const spec of specs) {
          if (!spec.patch) throw new Error("A development decoy has no patch.");
          const patch = path.join(runDirectory, "patches", `${spec.id}.patch`);
          await writeFile(patch, await readFile(spec.patch));
          archived.push({ ...spec, patch });
        }
        return archived;
      },
      async evaluate(spec, checks, version) {
        report.stage = `v${version}/${spec.id}`;
        await save();
        const result = await evaluateVariant(spec, { baseline, runDirectory: path.join(runDirectory, "check-runs", `v${version}`), checks, subject, probes: salon.probes });
        console.log(`v${version}/${result.id}: ${result.outcome}${result.checks?.expectationId ? ` [${result.checks.expectationId}]` : ""}`);
        return result;
      },
      async changed(version) {
        report.checkVersions[version.version - 1] = version;
        report.checks = version.checks;
        report.variants = [...version.results];
        report.development = countDecoys(version.results.filter(({ kind }) => kind === "development"));
        await save();
      },
    });
    report.strengthening = { rounds: versions.rounds, reason: versions.reason };
    if (versions.status === "blocked") {
      report.status = "blocked";
      report.verdict = "Stopped: the original must fail on E1 and both correct controls must pass every checks version.";
    } else if (versions.status === "needs-review") {
      report.status = "needs-review";
      report.pendingReview = { proposalPath: versions.proposalPath, reasons: versions.reviewReasons };
      report.verdict = "Stopped for owner review: strengthening would alter an agreed expectation. No final checks were frozen.";
    } else {
      const last = versions.versions.at(-1);
      if (!last?.gatePassed) throw new Error("No passing final checks version.");
      report.finalFreeze = await sealFinalChecks(runDirectory, last.version, last.checks, baseline);
      report.stage = "final-freeze";
      await save();
      if (candidate && options.candidateFactory) throw new Error("Choose a supplied candidate or the built-in fixer, not both.");
      report.candidateSource = options.candidateFactory ? "built-in-fixer" : candidate ? "supplied-patch" : undefined;
      report.stage = options.candidateFactory ? "fixer" : "candidate";
      await save();
      const candidatePatch = candidate ?? await options.candidateFactory?.(baseline);
      if (candidatePatch) {
        const patch = path.join(runDirectory, "candidate.patch");
        await writeFile(patch, await readFile(candidatePatch));
        const result = await evaluateVariant({ id: "candidate", kind: "candidate", patch, requirements: [] }, { baseline, runDirectory, checks: last.checks, subject, probes: salon.probes });
        report.variants.push(result);
        console.log(`candidate: ${result.outcome}`);
      }
      await verifyChecks(last.checks);
      report.status = "completed";
      report.verdict = evidenceSummary(report);
    }
    report.stage = "finished";
  } catch (error) {
    report.status = error instanceof Error && error.name === "BudgetExceededError" ? "budget-stopped" : "error";
    report.error = errorMessage(error);
    report.verdict = report.status === "budget-stopped" ? "Run stopped at the model budget cap; no completed verdict." : "Run stopped by an execution error; no completed verdict.";
  } finally {
    report.finishedAt = new Date().toISOString(); report.durationMs = Date.now() - started;
    report.modelUsage = options.modelUsage?.(); report.client = clientVerdict(report);
    await save();
  }
  return { report, reportPath };
}
