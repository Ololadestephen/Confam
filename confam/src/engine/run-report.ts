import type { VariantResult } from "./contracts.js";
import type { CheckVersion } from "./check-versions.js";
import type { FinalFreeze, FrozenChecks } from "./freeze.js";

export interface OutcomeCounts { caught: number; survived: number; uncounted: number; total: number; }
export interface ClientVerdict {
  state: "provisional" | "holds" | "does-not-hold" | "checks-not-strong-enough" | "inconclusive" | "no-candidate";
  sentence: string;
  uncertainty: string[];
}
export interface RunReport {
  schemaVersion: 1;
  id: string;
  case: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: "running" | "completed" | "blocked" | "needs-review" | "budget-stopped" | "error";
  stage: string;
  checks?: FrozenChecks;
  checkVersions: CheckVersion[];
  strengthening?: { rounds: number; reason: string; };
  pendingReview?: { proposalPath: string; reasons: string[]; };
  finalFreeze?: FinalFreeze;
  variants: VariantResult[];
  development: OutcomeCounts;
  heldOut: { evaluated: false; } | ({ evaluated: true; reportPath: string; } & OutcomeCounts);
  verdict: string;
  client?: ClientVerdict;
  limitations: string[];
  error?: string;
  provenance?: { mode: "live" | "fixture"; sessionId: string; };
  modelUsage?: unknown;
  candidateSource?: "supplied-patch" | "built-in-fixer";
}
