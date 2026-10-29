import type { Dispatch, SetStateAction } from "react";
import type {
  OnboardingSession,
  ReviewedRequirements,
} from "../../../onboarding/contracts.js";

export function ExportReview({
  session,
  approved,
  setApproved,
  send,
  busy,
}: {
  session: OnboardingSession;
  approved: boolean;
  setApproved: (value: boolean) => void;
  send: () => void;
  busy: boolean;
}) {
  const preview = session.preview;
  if (!preview)
    return <p className="error-note">Export preview is unavailable.</p>;
  return (
    <div className="form-fields">
      <h3>Review the data to send</h3>
      <p>
        Destination: {preview.destination} · Model: {preview.model} · Combined
        session model cap: ${preview.capUsd.toFixed(2)}
      </p>
      {preview.recording && (
        <p>
          Recording: {preview.recording.name} · {preview.recording.bytes} bytes
          · {preview.recording.durationSeconds} seconds · SHA-256{" "}
          <code>{preview.recording.sha256}</code>
        </p>
      )}
      <p className="notice">
        Text secrets are redacted on a best-effort basis. Review all remaining
        content before approval.{" "}
        {preview.recording && "The entire recording is sent without redaction."}{" "}
        The combined session model cap is shared across both proposals.
      </p>
      <p>
        Payload hash: <code>{preview.hash}</code>
      </p>
      <details open>
        <summary>Exact input</summary>
        <pre className="mono">{preview.payload.input}</pre>
      </details>
      <details>
        <summary>Instructions</summary>
        <pre className="mono">{preview.payload.instructions}</pre>
      </details>
      <details>
        <summary>Output schema and token limit</summary>
        <pre className="mono">
          {JSON.stringify(
            {
              schema: preview.payload.schema,
              maxOutputTokens: preview.payload.maxOutputTokens,
            },
            null,
            2,
          )}
        </pre>
      </details>
      <label>
        <input
          type="checkbox"
          checked={approved}
          onChange={(event) => setApproved(event.target.checked)}
        />{" "}
        I approve sending this exact payload to {preview.destination}.
      </label>
      <button
        className="button button-dark"
        disabled={!approved || busy}
        onClick={send}
      >
        Send for {session.phase === "intake" ? "requirements" : "workflow"}{" "}
        proposal
      </button>
    </div>
  );
}

export function RequirementsReview({
  session,
  review,
  setReview,
  fixtures,
  setFixtures,
  submit,
  busy,
}: {
  session: OnboardingSession;
  review: ReviewedRequirements;
  setReview: Dispatch<SetStateAction<ReviewedRequirements>>;
  fixtures: string;
  setFixtures: (value: string) => void;
  submit: () => void;
  busy: boolean;
}) {
  return (
    <div className="form-fields">
      <p>{session.requirements?.summary}</p>
      {session.requirements?.observations.map((item, index) => (
        <p key={index}>
          <code>{item.timestampSeconds}s</code> {item.description}
        </p>
      ))}
      <h3>Review expectations</h3>
      {review.expectations.map((item, index) => (
        <div className="expectation" key={item.id}>
          <code>{item.id}</code>
          <label className="field">
            <span>Expected behavior {item.id}</span>
            <textarea
              disabled={busy}
              value={item.statement}
              onChange={(event) =>
                setReview((old) => ({
                  ...old,
                  expectations: old.expectations.map((entry, i) =>
                    i === index
                      ? {
                          ...entry,
                          statement: event.target.value,
                          provenance: "developer",
                        }
                      : entry,
                  ),
                }))
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={review.reproductionTargets.includes(item.id)}
              onChange={(event) =>
                setReview((old) => ({
                  ...old,
                  reproductionTargets: event.target.checked
                    ? [...old.reproductionTargets, item.id]
                    : old.reproductionTargets.filter((id) => id !== item.id),
                }))
              }
            />{" "}
            Reproduction target
          </label>
          <button
            className="button button-outline"
            disabled={busy || review.expectations.length <= 1}
            onClick={() =>
              setReview((old) => ({
                ...old,
                expectations: old.expectations.filter(
                  (entry) => entry.id !== item.id,
                ),
                reproductionTargets: old.reproductionTargets.filter(
                  (id) => id !== item.id,
                ),
              }))
            }
          >
            Remove {item.id}
          </button>
        </div>
      ))}
      <button
        className="button button-outline"
        disabled={busy || review.expectations.length >= 20}
        onClick={() =>
          setReview((old) => {
            let number = 1;
            while (old.expectations.some((entry) => entry.id === `E${number}`))
              number++;
            return {
              ...old,
              expectations: [
                ...old.expectations,
                { id: `E${number}`, statement: "", provenance: "developer" },
              ],
            };
          })
        }
      >
        Add expectation
      </button>
      {review.answers.map((item, index) => (
        <label className="field" key={index}>
          <span>{item.question}</span>
          <input
            disabled={busy}
            value={item.answer}
            onChange={(event) =>
              setReview((old) => ({
                ...old,
                answers: old.answers.map((entry, i) =>
                  i === index
                    ? { ...entry, answer: event.target.value }
                    : entry,
                ),
              }))
            }
          />
        </label>
      ))}
      <p>Test data:</p>
      <pre className="mono">{fixtures}</pre>
      <details>
        <summary>Edit test data</summary>
        <label className="field">
          <span>Fixture values · JSON object</span>
          <textarea
            className="mono"
            rows={6}
            disabled={busy}
            value={fixtures}
            onChange={(event) => setFixtures(event.target.value)}
          />
        </label>
      </details>
      <p className="notice">
        Preparing the workflow preview does not execute the app or send data to
        the model.
      </p>
      <button className="button button-dark" disabled={busy} onClick={submit}>
        Prepare workflow export
      </button>
    </div>
  );
}

export function WorkflowReview({
  session,
  workflow,
  setWorkflow,
  confirm,
  busy,
}: {
  session: OnboardingSession;
  workflow: string;
  setWorkflow: (value: string) => void;
  confirm: () => void;
  busy: boolean;
}) {
  let steps: Array<Record<string, unknown>> = [];
  let invalid = false;
  try {
    const parsed: unknown = JSON.parse(workflow);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as { steps?: unknown }).steps)
    )
      throw new Error("Invalid steps");
    const values = (parsed as { steps: unknown[] }).steps;
    if (
      values.some(
        (step) =>
          !step ||
          typeof step !== "object" ||
          Array.isArray(step) ||
          typeof (step as { action?: unknown }).action !== "string",
      )
    )
      throw new Error("Invalid step");
    steps = values as Array<Record<string, unknown>>;
  } catch {
    invalid = true;
  }
  return (
    <div className="form-fields">
      <h3>Review the proposed workflow</h3>
      {session.error && (
        <p className="error-note" role="alert">
          Needs correction: {session.error}
        </p>
      )}
      <ol>
        {steps.map((step, index) => (
          <li key={index}>
            <strong>{String(step.action)}</strong>{" "}
            <code>{JSON.stringify(step)}</code>
          </li>
        ))}
      </ol>
      {invalid && (
        <p className="error-note" role="alert">
          Workflow JSON must be an object with a steps array of actions.
        </p>
      )}
      <details open={invalid || undefined}>
        <summary>Edit workflow JSON</summary>
        <label className="field">
          <span>Workflow JSON</span>
          <textarea
            className="mono"
            rows={18}
            disabled={busy}
            value={workflow}
            onChange={(event) => setWorkflow(event.target.value)}
          />
        </label>
      </details>
      <p className="notice">
        Confirmation validates and saves local artifacts. It does not execute
        the application.
      </p>
      <button
        className="button button-dark"
        disabled={busy || !session.workflow || invalid}
        onClick={confirm}
      >
        Confirm and save
      </button>
    </div>
  );
}
