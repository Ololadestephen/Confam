import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { challengeProject, type ChallengeOptions } from "../challenges/harness.js";
import { verifyProject, type VerificationOptions } from "../project/verify.js";

export interface ReviewOptions extends Omit<VerificationOptions, "candidate" | "confirmation"> {
  candidate: string;
  confirmation: ChallengeOptions["confirmation"];
  manifest?: string;
}
export interface ReviewResult { markdownPath: string; reportPath?: string; exitCode: 0 | 1 | 2; }

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const safe = (value: unknown): string => String(value ?? "unknown").slice(0, 1000).replace(/[\\`*_\[\]<>#|]/g, "\\$&").replace(/[\r\n]+/g, " ");
const outcome = (variant: unknown): string => {
  const v = object(variant);
  return v.error ? "error" : String(object(v.result).status ?? "not evaluated");
};

/** Render only runner-produced evidence; incomplete executions never become candidate failures. */
export function renderReview(report: RecordValue, reportPath: string | undefined, challenge: boolean): { markdown: string; exitCode: 0 | 1 | 2 } {
  const complete = report.status === "completed" && report.cleanupComplete !== false;
  const candidate = challenge ? object(report.candidate).outcome : report.candidate;
  const passed = complete && (challenge ? candidate === "passed-checks-and-probes" : candidate === "passed");
  const failed = complete && (challenge ? candidate === "failed-checks" || candidate === "failed-probes" : candidate === "failed");
  const exitCode = passed ? 0 : failed ? 1 : 2;
  const versions = object(report.versions);
  const lastVersion = object(list(versions.versions).at(-1));
  const challengeResults = object(lastVersion.results);
  const variants = list(report.variants);
  const original = challenge ? challengeResults.original : variants.find((v) => object(v).kind === "original");
  const controls = challenge ? list(challengeResults.controls) : variants.filter((v) => object(v).kind === "control");
  const counts = object(report.development);
  const lines = ["# Confam review", "", `- Project: ${safe(report.project)}`, `- Case: ${safe(report.caseId)}`,
    `- Status: ${safe(report.status)}`, `- Candidate: ${passed ? "passed the required checks under the recorded conditions" : failed ? (challenge ? `failed (${safe(candidate)})` : "failed the required checks under the recorded conditions") : "incomplete; no candidate verdict"}`,
    `- Reproduction: ${safe(outcome(original))}${report.status === "blocked" ? " (required gate unresolved)" : ""}`,
    `- Controls: ${controls.length ? controls.slice(0, 50).map((v) => `${safe(object(v).id)}: ${safe(outcome(v))}`).join(", ") : "none evaluated; false-rejection calibration unavailable"}`,
    challenge && complete ? `- Development decoys: ${safe(counts.caught)} caught, ${safe(counts.survived)} survived, ${safe(counts.uncounted)} uncounted (of ${safe(counts.total)}).` : "- Development decoys: not completed.",
    "- Independent evaluation: not performed.",
    reportPath ? `- Runner report: [local JSON report](${encodeURI(reportPath).replace(/[()?#]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)})` : "- Runner report: unavailable.",
    "", "## Limitations", "", "- Results cover only the confirmed expectations, fixtures, and recorded conditions; they do not prove application correctness.",
    ...list(report.limitations).slice(0, 30).map((item) => `- ${safe(item)}`),
  ];
  if (report.error) lines.push(`- Execution error: ${safe(report.error)}`);
  return { markdown: lines.join("\n") + "\n", exitCode };
}

export async function reviewProject(options: ReviewOptions): Promise<ReviewResult> {
  let report: RecordValue;
  let reportPath: string | undefined;
  try {
    if (!options.candidate) throw new Error("A candidate patch is required for review.");
    const result = options.manifest
      ? await challengeProject({ project: options.project, caseFile: options.caseFile, workflow: options.workflow, candidate: options.candidate, confirmation: options.confirmation, runsDirectory: options.runsDirectory, manifest: options.manifest })
      : await verifyProject(options);
    report = result.report as unknown as RecordValue;
    reportPath = result.reportPath;
  } catch (error) {
    report = { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
  const rendered = renderReview(report, reportPath, Boolean(options.manifest));
  const directory = reportPath ? path.dirname(reportPath) : path.resolve(options.runsDirectory, `review-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const markdownPath = path.join(directory, "review.md");
  await writeFile(markdownPath, rendered.markdown, { flag: "wx" });
  return { markdownPath, reportPath, exitCode: rendered.exitCode };
}
