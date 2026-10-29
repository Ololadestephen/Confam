import type { Dispatch, SetStateAction } from "react";
import { downloadText, prepareDraft, type DraftFields } from "../draft.js";
import { Icon, Link } from "../shared.js";

type Update = (key: keyof DraftFields, value: string) => void;
type FieldsProps = { fields: DraftFields; update: Update };
type ReportProps = FieldsProps & {
  recording: string;
  setRecording: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
};
type ReviewProps = {
  fields: DraftFields;
  review: ReturnType<typeof prepareDraft>;
  copied: boolean;
  setCopied: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
};

function makeField({ fields, update }: FieldsProps) {
  const field = (
    key: keyof DraftFields,
    label: string,
    placeholder?: string,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        value={fields[key]}
        onChange={(e) => update(key, e.target.value)}
        placeholder={placeholder}
        required={key !== "candidatePath"}
        autoComplete="off"
      />
    </label>
  );
  return field;
}

export function ReportStep(props: ReportProps) {
  const { fields, update, recording, setRecording, setError } = props;
  const field = makeField(props);
  return (
    <div className="form-fields">
      <div className="two-fields">
        {field("projectId", "Project ID", "my-project")}
        {field("caseId", "Case ID", "stateDisappears")}
      </div>
      <label className="field">
        <span>What happened?</span>
        <textarea
          rows={7}
          placeholder="I changed the status. It looked saved, but after reopening the page…"
          value={fields.report}
          onChange={(e) => update("report", e.target.value)}
          maxLength={65536}
        />
      </label>
      <label className="upload-box">
        <Icon name="play" />
        <strong>Recording (optional MP4)</strong>
        <input
          type="file"
          aria-label="Recording (optional MP4)"
          accept="video/mp4,.mp4"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (
              file &&
              (!file.name.toLowerCase().endsWith(".mp4") ||
                file.size > 10 * 1024 * 1024)
            ) {
              setError("Choose an MP4 up to 10MiB.");
              e.target.value = "";
              setRecording("");
            } else {
              setRecording(file?.name ?? "");
              setError("");
            }
          }}
        />
      </label>
      {recording ? (
        <dl className="review-facts">
          <div>
            <dt>Recording</dt>
            <dd>Selected locally</dd>
          </div>
          <div>
            <dt>Interpretation</dt>
            <dd>Not performed</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

export function ExpectationsStep(props: FieldsProps) {
  const { fields, update } = props;
  const field = makeField(props);
  const statements = fields.expectations.split("\n");
  return (
    <div className="form-fields">
      <fieldset className="expectation-fields">
        <legend>Expectations</legend>
        {statements.map((statement, index) => (
          <div className="expectation-input" key={index}>
            <label className="field">
              <span>
                E{index + 1}
                {index === 0 ? " · Reproduction target" : ""}
              </span>
              <input
                aria-label={`Expectation ${index + 1}`}
                value={statement}
                onChange={(event) =>
                  update(
                    "expectations",
                    statements
                      .map((text, i) =>
                        i === index ? event.target.value : text,
                      )
                      .join("\n"),
                  )
                }
              />
            </label>
            {index > 0 ? (
              <button
                type="button"
                className="button button-outline"
                aria-label={`Remove expectation ${index + 1}`}
                onClick={() =>
                  update(
                    "expectations",
                    statements.filter((_, i) => i !== index).join("\n"),
                  )
                }
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="button button-outline"
          onClick={() => update("expectations", fields.expectations + "\n")}
        >
          Add expectation
        </button>
      </fieldset>
      <div className="two-fields">
        {field("projectPath", "Project configuration", "project.json")}
        {field("workflowPath", "Workflow", "workflow.json")}
      </div>
      <div className="two-fields">
        {field("casePath", "Case file", "case.json")}
        {field("candidatePath", "Candidate patch (optional)", "repair.patch")}
      </div>
      <label className="field">
        <span>Fixtures (JSON)</span>
        <textarea
          className="mono"
          rows={4}
          value={fields.fixtures}
          onChange={(event) => update("fixtures", event.target.value)}
        />
      </label>
    </div>
  );
}

export function ReviewStep({
  fields,
  review,
  copied,
  setCopied,
  setError,
}: ReviewProps) {
  return (
    <div className="form-fields">
      <div className="review-heading">
        <h2>Review draft</h2>
        <span className="pill">Not executed</span>
      </div>
      <dl className="review-facts">
        <div>
          <dt>Project</dt>
          <dd>
            <code>{fields.projectPath}</code>
          </dd>
        </div>
        <div>
          <dt>Workflow</dt>
          <dd>
            <code>{fields.workflowPath}</code>
          </dd>
        </div>
        <div>
          <dt>Case</dt>
          <dd>
            <code>{fields.casePath}</code>
          </dd>
        </div>
        <div>
          <dt>Report</dt>
          <dd>
            <code>
              {fields.casePath.slice(
                0,
                Math.max(
                  fields.casePath.lastIndexOf("/"),
                  fields.casePath.lastIndexOf("\\"),
                ) + 1,
              )}
              report.md
            </code>
          </dd>
        </div>
        <div>
          <dt>Candidate</dt>
          <dd>{fields.candidatePath || "Not supplied"}</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>CLI</dd>
        </div>
        <div>
          <dt>Reproduction target</dt>
          <dd>{review.definition.reproductionTargets.join(", ")}</dd>
        </div>
      </dl>
      <div className="expectation-list">
        {review.definition.expectations.map((item) => (
          <div className="expectation" key={item.id}>
            <code>{item.id}</code>
            <p>{item.statement}</p>
          </div>
        ))}
      </div>
      <div className="button-row">
        <button
          className="button button-outline"
          onClick={() =>
            downloadText(
              fields.casePath.split(/[\\/]/).at(-1) || "case.json",
              JSON.stringify(review.definition, null, 2) + "\n",
            )
          }
        >
          Download case
        </button>
        <button
          className="button button-outline"
          onClick={() =>
            downloadText("report.md", fields.report, "text/markdown")
          }
        >
          Download report
        </button>
      </div>

      <div className="command-box">
        <code>{review.command}</code>
        <button
          aria-label="Copy verification command"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(review.command);
              setCopied(true);
            } catch {
              setError(
                "Clipboard is unavailable. Select and copy the command directly.",
              );
            }
          }}
        >
          {copied ? "Copied" : "Copy "}
        </button>
      </div>

      <Link to="/runs" className="text-link">
        Runs
      </Link>
    </div>
  );
}
