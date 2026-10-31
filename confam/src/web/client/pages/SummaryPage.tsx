import { STATIC_SITE, apiUrl } from "../api.js";
import { Link, PageTitle } from "../shared.js";
import { runPath } from "../routing.js";
import type { RunView } from "../types.js";

// A client reads the candidate's actual result first; the full technical verdict stays below it.
// Only a completed run earns a pass or fail headline.
const PASSED = new Set(["passed", "passed-checks-and-probes"]);
const FAILED = new Set(["assertion-failed", "failed-checks"]);
export function plainHeadline(run: RunView): string {
  if (run.status !== "completed") return run.verdict;
  const outcome = run.variants.find((v) => v.kind === "candidate")?.outcome ?? "";
  if (PASSED.has(outcome)) return "The proposed fix passed every check listed below.";
  if (outcome === "failed-probes") return "The proposed fix passed the checks below, but independent probes contradicted it.";
  if (FAILED.has(outcome)) return "The proposed fix did not pass the checks listed below.";
  return run.verdict;
}

export function Summary({ run }: { run: RunView }) {
  const headline = plainHeadline(run);
  const development = run.development;
  return (
    <>
      <PageTitle
        eyebrow="Local summary preview"
        title="The result, with its context."
      >
        A plain-language view to review before exporting. This is not a hosted
        share link.
      </PageTitle>
      <section className="summary-paper">
        <span className="paper-star">✳</span>
        <p className="eyebrow">
          {run.project} / {run.caseId}
        </p>
        <h2>{headline}</h2>
        {headline !== run.verdict ? <p className="muted">{run.verdict}</p> : null}
        {development && development.total > 0 ? (
          <p>
            Before trusting these checks, Confam ran {development.total}{" "}
            deliberately wrong fixes against them: {development.caught} caught,{" "}
            {development.survived} survived, {development.uncounted} could not be
            counted. These are development results, not independent
            evaluation.
          </p>
        ) : null}
        {run.fixture ? (
          <p className="fixture-note">
            Scripted fixture inputs. Independent evaluation is separate.
          </p>
        ) : null}
        <h3>What was being checked</h3>
        {run.expectations.length ? (
          <ul>
            {run.expectations.map((item) => (
              <li key={item.id}>{item.statement}</li>
            ))}
          </ul>
        ) : (
          <p>No confirmed expectations included in this report.</p>
        )}
        <h3>What remains uncertain</h3>
        <ul>
          {run.limitations.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
        <p>{run.independent.label}</p>
        {STATIC_SITE ? null : (
          <>
            <a
              className="button button-dark"
              href={apiUrl("/api/export", run.runId)}
              download
            >
              Export redacted summary
            </a>
            <p className="small muted">
              The JSON summary excludes recordings, traces, logs, source and
              local links. Redaction is best effort. Review the file before
              sharing it.
            </p>
          </>
        )}
      </section>
      <Link to={runPath(run.runId)} className="text-link">
        Back to the full evidence
      </Link>
    </>
  );
}
