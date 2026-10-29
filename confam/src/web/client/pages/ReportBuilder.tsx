import { useRef } from "react";
import {
  newCaseId,
  onboardingRequest,
  useReportBuilder,
  parseDraftJson,
} from "../onboarding-state.js";
import { Link, PageTitle } from "../shared.js";
import {
  ExportReview,
  RequirementsReview,
  WorkflowReview,
} from "./ReportBuilderSteps.js";

export default function ReportBuilder({ projectId }: { projectId: string }) {
  const {
    session,
    setSession,
    ready,
    projectName,
    caseId,
    setCaseId,
    report,
    setReport,
    recording,
    setRecording,
    approved,
    setApproved,
    review,
    setReview,
    fixtures,
    setFixtures,
    workflow,
    setWorkflow,
    error,
    setError,
    busy,
    run,
    preview,
    submitReview,
  } = useReportBuilder(projectId);
  const recordingInput = useRef<HTMLInputElement>(null);
  return (
    <main id="main" className="workspace">
      <PageTitle eyebrow="A new question" title="Start with what happened.">
        {session?.projectName || projectName
          ? `App: ${session?.projectName || projectName}. `
          : ""}
        Review each proposal and export before continuing.
      </PageTitle>
      <section className="form-panel">
        {session?.mode === "fixture" && (
          <p className="notice">
            <strong>Fixture mode:</strong> proposals are supplied by a fixture,
            not a live model.
          </p>
        )}
        {session?.usage && (
          <p className="notice">
            Model spend estimate: ${session.usage.estimatedSpendUsd.toFixed(4)}.
            Budget used: ${session.usage.budgetUsedUsd.toFixed(4)} / $0.25.
            {session.usage.hasUncertainUsage
              ? " Usage is uncertain; further calls are stopped."
              : ""}
          </p>
        )}
        {!ready && (
          <p>
            App configuration must be reviewed before this flow can begin.{" "}
            <Link
              to={`/runs/new?manual=1&project=${encodeURIComponent(projectId)}`}
            >
              Use manual setup
            </Link>{" "}
            or <Link to="/projects">review apps</Link>.
          </p>
        )}
        {ready && !session && (
          <div className="form-fields">
            <label className="field">
              <span>What happened?</span>
              <textarea
                disabled={busy}
                rows={7}
                maxLength={65536}
                value={report}
                onChange={(event) => setReport(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Recording · optional MP4 up to 10 MiB</span>
              <input
                disabled={busy}
                ref={recordingInput}
                type="file"
                accept="video/mp4,.mp4"
                onChange={(event) => setRecording(event.target.files?.[0])}
              />
              <small>
                The recording stays local until you approve an export. Maximum
                duration: 120 seconds.
              </small>
            </label>
            {recording && (
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => {
                  setRecording(undefined);
                  if (recordingInput.current) recordingInput.current.value = "";
                  setError("");
                }}
              >
                Remove recording
              </button>
            )}
            <details>
              <summary>Case settings</summary>
              <label className="field">
                <span>Case ID</span>
                <input
                  disabled={busy}
                  value={caseId}
                  onChange={(event) => setCaseId(event.target.value)}
                  placeholder="stateDisappears"
                />
              </label>
            </details>
            <button
              className="button button-dark"
              disabled={busy || !caseId.trim() || !report.trim()}
              onClick={() => void preview()}
            >
              Prepare export preview
            </button>
          </div>
        )}
        {session?.status === "export-review" && (
          <ExportReview
            session={session}
            approved={approved}
            setApproved={setApproved}
            busy={busy}
            send={() =>
              void run(() =>
                onboardingRequest({
                  action: "generate",
                  id: session.id,
                  hash: session.preview?.hash,
                  approve: true,
                }),
              )
            }
          />
        )}
        {session?.status === "requirements-review" && review && (
          <RequirementsReview
            session={session}
            review={review}
            setReview={setReview}
            fixtures={fixtures}
            setFixtures={setFixtures}
            busy={busy}
            submit={submitReview}
          />
        )}
        {session?.status === "workflow-review" && (
          <WorkflowReview
            session={session}
            workflow={workflow}
            setWorkflow={setWorkflow}
            busy={busy}
            confirm={() =>
              void run(async () =>
                onboardingRequest({
                  action: "confirm",
                  id: session.id,
                  workflow: parseDraftJson(workflow, "Workflow"),
                }),
              )
            }
          />
        )}
        {session?.status === "generating" && (
          <p role="status">
            Generating proposal. Reload this draft to check its status.
          </p>
        )}
        {session?.status === "error" && (
          <p className="error-note" role="alert">
            {session.error ?? "The proposal could not be generated."} Use manual
            setup to continue.
          </p>
        )}
        {session?.status === "error" && session.phase === "checks" && (
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() =>
              void run(() =>
                onboardingRequest({
                  action: "review-proposal",
                  id: session.id,
                }),
              )
            }
          >
            Edit saved workflow
          </button>
        )}
        {session?.status === "error" && (
          <button
            className="button button-outline"
            disabled={busy || session.usage?.hasUncertainUsage}
            onClick={() =>
              void run(() =>
                onboardingRequest({ action: "repreview", id: session.id }),
              )
            }
          >
            Prepare new export
          </button>
        )}
        {session?.status === "confirmed" && session.files && (
          <div className="form-fields">
            <h3>Saved locally</h3>
            <p>Review the files before running the command.</p>
            <ul>
              {Object.entries(session.files)
                .filter(([key]) => key !== "command")
                .map(([key, value]) => (
                  <li key={key}>
                    {key}: <code>{value}</code>
                  </li>
                ))}
            </ul>
            <div className="command-box">
              <code>{session.files.command}</code>
            </div>
            <p>No application has been executed.</p>
          </div>
        )}
        {error && (
          <p className="error-note" role="alert">
            {error}
          </p>
        )}
        {session && (
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete("draft");
              window.history.replaceState(null, "", url);
              setSession(undefined);
              setCaseId(newCaseId());
              setReport("");
              setRecording(undefined);
              setError("");
            }}
          >
            Start a new report
          </button>
        )}
        <p>
          <Link
            to={`/runs/new?manual=1&project=${encodeURIComponent(projectId)}`}
          >
            Use manual setup
          </Link>{" "}
          · <Link to="/projects">Apps</Link>
        </p>
      </section>
    </main>
  );
}
