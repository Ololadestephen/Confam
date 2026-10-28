import type { VariantResult } from "./contracts.js";
import type { RunReport, ClientVerdict, OutcomeCounts } from "./run-report.js";

export function countDecoys(results: VariantResult[]): OutcomeCounts {
  const caught = results.filter(({ outcome }) => outcome === "caught").length;
  const survived = results.filter(({ outcome }) => outcome === "survived").length;
  return { caught, survived, uncounted: results.length - caught - survived, total: results.length };
}

export function evidenceSummary(report: RunReport): string {
  const counts = report.development;
  const development = `${counts.caught} of ${counts.caught + counts.survived} oracle-confirmed development decoys caught; ${counts.survived} survived; ${counts.uncounted} uncounted.`;
  const heldOut = report.heldOut.evaluated
    ? `Held-out decoys: ${report.heldOut.caught} caught, ${report.heldOut.survived} survived, ${report.heldOut.uncounted} uncounted.`
    : "Held-out decoys have not been evaluated.";
  const candidate = report.variants.find(({ kind }) => kind === "candidate");
  return `${candidate ? `Candidate: ${candidate.outcome}. ` : ""}${development} ${heldOut}`;
}

export function clientVerdict(report: RunReport): ClientVerdict {
  const uncertainty = [...report.limitations];
  if (report.status !== "completed") return { state: "inconclusive", sentence: report.verdict, uncertainty };
  if (report.development.survived > 0 || (report.heldOut.evaluated && report.heldOut.survived > 0)) {
    return { state: "checks-not-strong-enough", sentence: "A confirmed faulty patch passed these checks, so they are not strong enough yet.", uncertainty };
  }
  const candidate = report.variants.find(({ kind }) => kind === "candidate");
  if (!candidate) return { state: "no-candidate", sentence: "The checks were challenged; no candidate repair has been evaluated.", uncertainty };
  if (candidate.outcome === "caught") return { state: "does-not-hold", sentence: "The candidate repair failed a confirmed appointment expectation.", uncertainty };
  if (candidate.outcome !== "passed") return { state: "inconclusive", sentence: "The candidate repair could not be confirmed under these conditions.", uncertainty };
  if (!report.heldOut.evaluated || report.heldOut.total === 0 || report.heldOut.uncounted > 0 || report.development.uncounted > 0) {
    return { state: "provisional", sentence: "The candidate passed the confirmed appointment checks; independent evaluation is still incomplete.", uncertainty };
  }
  return { state: "holds", sentence: "The candidate passed the confirmed appointment checks and the tested faulty patches were caught.", uncertainty };
}
