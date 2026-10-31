import { Status } from "../evidence.js";
import { statusText } from "../format.js";
import { dollars, shortPath, useRepairSession } from "../gaps-state.js";
import { Link, PageTitle } from "../shared.js";

function waitingFor(stage: string | undefined) {
  if (stage === "fixer")
    return "Your approval to send the next repair request to the fixer model.";
  if (stage === "gaps")
    return "Your approval to send the repaired code to Muse Spark for a gap review.";
  return "Your approval for the next step.";
}

export default function RepairSessionPage({ folderId }: { folderId: string }) {
  const { session, error } = useRepairSession(folderId);
  if (!session || session.unreadable)
    return (
      <main id="main" className="workspace">
        <PageTitle
          eyebrow="Repair session"
          title={
            error
              ? "This session could not be opened."
              : session
                ? "Unreadable session."
                : "Opening the session…"
          }
        >
          {error ??
            (session
              ? "The session state file is missing or not in the expected format."
              : "Reading the session from your local server.")}
        </PageTitle>
        <Link to="/gaps" className="button button-outline">
          Return to gap reviews
        </Link>
      </main>
    );
  const rounds = session.rounds ?? [];
  return (
    <main id="main" className="workspace">
      <div className="breadcrumb">
        <Link to="/gaps">Gap reviews</Link>
        <span>/</span>
        <span>{shortPath(session.project) ?? "Unknown project"}</span>
        <span>/</span>
        <code>{session.id}</code>
      </div>
      <PageTitle eyebrow="Repair session (read only)" title={shortPath(session.suite) ?? "Repair session."}>
        Each round applies a proposed patch and runs the confirmed checks. This
        page only reads the saved session; approvals happen in the CLI.
      </PageTitle>
      <div className="library-stats">
        <span>Status: {statusText(session.status ?? "unknown")}</span>
        <span>
          {rounds.length} of {session.maxRounds ?? "?"} rounds used
        </span>
        <span>Spend {dollars(session.spendUsd)}</span>
      </div>
      <ol className="repair-timeline" aria-label="Repair rounds">
        {rounds.map((round, index) => (
          <li key={index} className="panel">
            <h2>Round {round.round ?? index + 1}</h2>
            <p className="small muted">
              Patch {round.patchFile ? <code>{round.patchFile}</code> : "not recorded"}
              {round.patchHash ? (
                <>
                  {" "}
                  · hash <code>{round.patchHash.slice(0, 16)}</code>
                </>
              ) : null}
            </p>
            {round.results.length ? (
              <ul className="repair-results">
                {round.results.map((result, item) => (
                  <li key={item}>
                    <Status value={result.outcome} />{" "}
                    <code>{result.caseId ?? "unknown case"}</code>
                    {result.mode === "regression" ? " (regression check)" : ""}
                    {result.unmet.length ? (
                      <span>
                        {" "}
                        · unmet:{" "}
                        {result.unmet.map((id) => (
                          <code key={id} className="repair-unmet">
                            {id}
                          </code>
                        ))}
                      </span>
                    ) : null}
                    {result.evidence ? (
                      <p className="small muted">{result.evidence}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No results recorded for this round.</p>
            )}
          </li>
        ))}
        {session.pending ? (
          <li className="panel lavender-panel">
            <h2>Waiting: {statusText(session.pending.stage ?? "next step")}</h2>
            <p>{waitingFor(session.pending.stage)}</p>
            <p className="small muted">
              {session.pending.exportFile ? (
                <>
                  Prepared request <code>{session.pending.exportFile}</code>
                </>
              ) : null}
              {session.pending.exportHash ? (
                <>
                  {" "}
                  · hash <code>{session.pending.exportHash.slice(0, 16)}</code>
                </>
              ) : null}
            </p>
          </li>
        ) : null}
      </ol>
      {session.reviewId ? (
        <p>
          <Link to={`/gaps/${encodeURIComponent(session.reviewId)}`} className="button button-outline">
            Open the gap review for this repair
          </Link>
        </p>
      ) : null}
      <section className="section-block" aria-label="Outcome">
        <h2>Outcome</h2>
        <p>
          {session.outcome
            ? statusText(session.outcome)
            : "Not finished yet."}{" "}
          Total spend {dollars(session.spendUsd)}.
        </p>
      </section>
    </main>
  );
}
