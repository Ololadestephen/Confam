import { useState } from "react";
import { initialDraft, prepareDraft, type DraftFields } from "../draft.js";
import { Link, PageTitle } from "../shared.js";
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
    setCopied(false);
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
      <PageTitle title="Prepare run"></PageTitle>
      <div className="setup-layout">
        <aside className="setup-sidebar">
          <ol>
            {["Report", "Expectations", "Review"].map((name, index) => (
              <li
                key={name}
                className={step === index ? "active" : ""}
                aria-current={step === index ? "step" : undefined}
              >
                <span>{step > index ? "✓" : `0${index + 1}`}</span>
                {name}
              </li>
            ))}
          </ol>
        </aside>
        <section
          className="form-panel"
          aria-label={["Report", "Expectations", "Review draft"][step]}
        >
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
