import { useState } from "react";
import { initialDraft, prepareDraft, type DraftFields } from "../draft.js";
import { Icon, Link, PageTitle } from "../shared.js";
import { ExpectationsStep, ReportStep, ReviewStep } from "./SetupSteps.js";
export default function Setup() {
  const [fields, setFields] = useState<DraftFields>(initialDraft);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState("");
  const [review, setReview] = useState<ReturnType<typeof prepareDraft>>();
  const [copied, setCopied] = useState(false);
  const update = (key: keyof DraftFields, value: string) => {
    setFields((old) => ({ ...old, [key]: value }));
    setError("");
    setReview(undefined);
  };
  const next = () => {
    if (
      step === 0 &&
      (!fields.projectId || !fields.caseId || !fields.report.trim())
    ) {
      setError("Add the project ID, case ID, and bug report to continue.");
      return;
    }
    if (step === 1) {
      try {
        setReview(prepareDraft(fields));
      } catch (cause) {
        setError((cause as Error).message);
        return;
      }
    }
    setError("");
    setStep((value) => Math.min(2, value + 1));
  };
  return (
    <main id="main" className="workspace">
      <PageTitle title="Prepare a run"></PageTitle>
      <div className="setup-layout">
        <aside className="setup-sidebar">
          <ol>
            {["The report", "The expectations", "Review & hand off"].map(
              (name, index) => (
                <li key={name} className={step === index ? "active" : ""}>
                  <span>{step > index ? "✓" : `0${index + 1}`}</span>
                  {name}
                </li>
              ),
            )}
          </ol>
          <div className="sidebar-note">
            <Icon name="file" />
            <h3>Local draft</h3>
            <p>
              This form prepares files and a CLI command. It does not upload
              source or recordings, call a model, or run the application.
            </p>
            <Link to="/guide">See the supported workflow </Link>
          </div>
        </aside>
        <section className="form-panel">
          <div className="form-section-heading">
            <span className="pill">Step {step + 1} of 3</span>
            <h2>{["Report", "Expectations", "Review"][step]}</h2>
          </div>
          {step === 0 ? (
            <ReportStep
              fields={fields}
              update={update}
              recording={recording}
              setRecording={setRecording}
              setError={setError}
            />
          ) : step === 1 ? (
            <ExpectationsStep fields={fields} update={update} />
          ) : review ? (
            <ReviewStep
              fields={fields}
              review={review}
              copied={copied}
              setCopied={setCopied}
              setError={setError}
            />
          ) : null}
          {error ? (
            <p className="error-note" role="alert">
              {error}
            </p>
          ) : null}
          <div className="form-actions">
            {step > 0 ? (
              <button
                className="button button-outline"
                onClick={() => {
                  setStep((value) => value - 1);
                  setError("");
                }}
              >
                Back
              </button>
            ) : (
              <Link to="/runs" className="text-link">
                Cancel
              </Link>
            )}
            {step < 2 ? (
              <button className="button button-dark" onClick={next}>
                {step === 0 ? "Define expectations" : "Review the draft"}{" "}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
