import { Icon, Link, PageTitle } from "../shared.js";
import { statusText } from "../format.js";
import {
  dollars,
  reviewedLabel,
  shortPath,
  useGapReviews,
  type GapReviewSummary,
} from "../gaps-state.js";

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}
function CountLine({ review }: { review: GapReviewSummary }) {
  if (review.unreadable) return <p>This proposal file could not be read.</p>;
  if (review.previewOnly || !review.counts)
    return <p>Preview, not sent. Nothing was proposed yet.</p>;
  const { proposed, confirmed, rejected, undecided } = review.counts;
  return (
    <p>
      {proposed} proposed · {confirmed} confirmed · {rejected} rejected ·{" "}
      {undecided} waiting for your decision
    </p>
  );
}
export default function GapReviews() {
  const { reviews, truncated, error, sessions } = useGapReviews();
  return (
    <main id="main" className="workspace">
      <PageTitle eyebrow="Missed expectations" title="Gap reviews.">
        Muse Spark suggests expectations your report may have missed. You
        decide which ones count.
      </PageTitle>
      <section className="library-panel" aria-label="Gap reviews">
        {error ? (
          <p className="error-note" role="alert">
            {error}
          </p>
        ) : !reviews ? (
          <p className="empty-state" role="status">
            Reading gap proposals…
          </p>
        ) : reviews.length ? (
          <div className="run-list">
            {reviews.map((review) => (
              <Link
                to={`/gaps/${encodeURIComponent(review.id)}`}
                key={review.id}
                className="run-row"
              >
                <span className="run-row-icon">
                  <Icon name={review.previewOnly ? "file" : "spark"} />
                </span>
                <div>
                  <span className="eyebrow">
                    {review.project ??
                      (review.previewOnly ? "Not sent to the model" : "Unknown project")}
                    {review.mode === "fixture" ? " · scripted fixture" : ""}
                  </span>
                  <h2>{review.caseId ?? "Preview, not sent"}</h2>
                  <CountLine review={review} />
                  <code>{review.id}</code>
                </div>
                <div className="run-row-end">
                  <span className="pill">
                    {review.unreadable
                      ? "Unreadable"
                      : review.previewOnly
                        ? "Preview, not sent"
                        : `Reviewed: ${reviewedLabel(review.reviewedCandidate).toLowerCase()}`}
                  </span>
                  <span className="small muted">
                    {when(review.created)} · {dollars(review.costUsd)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Icon name="file" size={36} />
            <h2>No gap proposals yet.</h2>
            <p>
              Run the gap proposal command from the CLI, then return here to
              review what it suggested.
            </p>
          </div>
        )}
      </section>
      {truncated ? (
        <p className="notice">
          Only the first 200 proposal folders are listed.
        </p>
      ) : null}
      {sessions.length ? (
        <section className="section-block" aria-label="Repair sessions">
          <h2>Repair sessions</h2>
          <div className="run-list">
            {sessions.map((session) => (
              <Link
                to={`/repairs/${encodeURIComponent(session.id)}`}
                key={session.id}
                className="run-row"
              >
                <span className="run-row-icon">
                  <Icon name="layers" />
                </span>
                <div>
                  <span className="eyebrow">
                    {session.unreadable
                      ? "Unreadable session"
                      : (shortPath(session.project) ?? "Unknown project")}
                  </span>
                  <h2>{shortPath(session.suite) ?? session.id}</h2>
                  {!session.unreadable ? (
                    <p>
                      {session.rounds ?? 0}{" "}
                      {session.rounds === 1 ? "round" : "rounds"} ·{" "}
                      {session.outcome
                        ? statusText(session.outcome)
                        : statusText(session.status ?? "unknown")}
                    </p>
                  ) : null}
                  <code>{session.id}</code>
                </div>
                <div className="run-row-end">
                  <span className="small muted">
                    {when(session.created)} · {dollars(session.spendUsd)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <p className="small muted library-note">
        Proposals are suggestions only. A confirmed gap still has to be
        reproduced before it counts as evidence.
      </p>
    </main>
  );
}
