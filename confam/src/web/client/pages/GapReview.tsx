import { useId, useState } from "react";
import { Link, PageTitle } from "../shared.js";
import { STATIC_SITE } from "../api.js";
import {
  dollars,
  reviewedLabel,
  useGapReview,
  type GapItem,
} from "../gaps-state.js";

function DecisionState({ gap }: { gap: GapItem }) {
  const [tone, icon, text] =
    gap.decision === "confirmed"
      ? ["review", "✓", STATIC_SITE ? "Confirmed by the developer" : "Confirmed. Not reproduced yet."]
      : gap.decision === "rejected"
        ? ["muted", "×", "Rejected"]
        : ["review", "?", "Waiting for your decision"];
  return (
    <span className={`status status-${tone}`}>
      <span aria-hidden="true">{icon}</span>
      {text}
    </span>
  );
}

function GapCard({
  gap,
  busy,
  decide,
}: {
  gap: GapItem;
  busy: boolean;
  decide: (decision: "confirmed" | "rejected", note: string) => void;
}) {
  const [note, setNote] = useState(gap.decisionNote ?? "");
  const noteId = useId();
  const headingId = useId();
  return (
    <article className="panel gap-card" aria-labelledby={headingId}>
      <div className="gap-card-top">
        <code>{gap.id}</code>
        <DecisionState gap={gap} />
      </div>
      <h2 id={headingId} className="gap-statement">
        {gap.statement}
      </h2>
      <dl className="gap-facts">
        <div>
          <dt>Why it matters</dt>
          <dd>{gap.why}</dd>
        </div>
        <div>
          <dt>Scenario to try</dt>
          <dd>{gap.scenario}</dd>
        </div>
      </dl>
      {gap.decidedAt ? (
        <p className="small muted">
          Decided {new Date(gap.decidedAt).toLocaleString()}
          {gap.decisionNote ? `. Note: ${gap.decisionNote}` : "."}
        </p>
      ) : null}
      {STATIC_SITE ? null : (
      <>
      <label className="field" htmlFor={noteId}>
        <span>Note (optional)</span>
        <textarea
          id={noteId}
          maxLength={1000}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why you confirmed or rejected this gap"
        />
      </label>
      <div className="button-row gap-actions">
        <button
          type="button"
          className="button button-dark"
          disabled={busy}
          aria-pressed={gap.decision === "confirmed"}
          aria-label={`Confirm gap ${gap.id}`}
          onClick={() => decide("confirmed", note)}
        >
          Confirm
        </button>
        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          aria-pressed={gap.decision === "rejected"}
          aria-label={`Reject gap ${gap.id}`}
          onClick={() => decide("rejected", note)}
        >
          Reject
        </button>
        {busy ? (
          <span className="small muted" role="status">
            Saving…
          </span>
        ) : null}
      </div>
      </>
      )}
    </article>
  );
}

export default function GapReviewPage({ folderId }: { folderId: string }) {
  const { review, error, busy, saveError, decide } = useGapReview(folderId);
  if (!review)
    return (
      <main id="main" className="workspace">
        <PageTitle
          eyebrow="Gap review"
          title={error ? "This review could not be opened." : "Opening the review…"}
        >
          {error ?? "Reading the proposal from your local server."}
        </PageTitle>
        <Link to="/gaps" className="button button-outline">
          Return to gap reviews
        </Link>
      </main>
    );
  return (
    <main id="main" className="workspace">
      <div className="breadcrumb">
        <Link to="/gaps">Gap reviews</Link>
        <span>/</span>
        <span>{review.project ?? "Preview"}</span>
        <span>/</span>
        <code>{review.caseId ?? review.id}</code>
      </div>
      <PageTitle
        eyebrow={review.previewOnly ? "Preview, not sent" : "Gap review"}
        title={review.previewOnly ? "Nothing was proposed yet." : "Missed expectations."}
      >
        {review.previewOnly
          ? "This folder holds a preview of what would be sent to Muse Spark. It was never sent, so there are no gaps to decide."
          : STATIC_SITE
            ? "Muse Spark proposed these missed expectations. The developer confirmed or rejected each one; confirmed gaps were then built as cases and run."
            : "Muse Spark proposed these missed expectations. Nothing counts until you confirm it, and a confirmed gap still has to be reproduced."}
      </PageTitle>
      {!review.previewOnly ? (
        <div className="library-stats">
          <span>Reviewed: {reviewedLabel(review.reviewedCandidate)}</span>
          <span>
            {review.counts
              ? `${review.counts.proposed} proposed · ${review.counts.confirmed} confirmed · ${review.counts.rejected} rejected · ${review.counts.undecided} waiting`
              : null}
          </span>
          <span>
            {review.mode === "fixture" ? "Scripted fixture" : "Live model call"}{" "}
            · {dollars(review.costUsd)}
          </span>
        </div>
      ) : null}
      {saveError ? (
        <p className="error-note" role="alert">
          {saveError}
        </p>
      ) : null}
      {review.gaps.length ? (
        <section className="gap-list" aria-label="Proposed gaps">
          {review.gaps.map((gap) => (
            <GapCard
              key={gap.id}
              gap={gap}
              busy={busy === gap.id}
              decide={(decision, note) => void decide(gap.id, decision, note)}
            />
          ))}
        </section>
      ) : null}
      {review.note ? <p className="notice">{review.note}</p> : null}
      <section className="section-block" aria-label="What was sent">
        <h2>What was sent to the model</h2>
        {review.sent ? (
          <>
            <p className="small muted">
              {review.sent.proposedFix
                ? "The report, the confirmed expectations, these source files and a proposed fix were sent."
                : "The report, the confirmed expectations and these source files were sent. No proposed fix was included."}
            </p>
            {review.sent.sources.length ? (
              <ul className="gap-sources">
                {review.sent.sources.map((name) => (
                  <li key={name}>
                    <code>{name}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No source files were included.</p>
            )}
            <details className="data-detail">
              <summary>Instructions given to the model</summary>
              <pre>{review.sent.instructions ?? "Not recorded"}</pre>
            </details>
            {review.approvedExportHash ? (
              <p className="small muted">
                Approved export hash <code>{review.approvedExportHash.slice(0, 16)}</code>
              </p>
            ) : null}
          </>
        ) : (
          <p className="small muted">The export file could not be read.</p>
        )}
      </section>
    </main>
  );
}
