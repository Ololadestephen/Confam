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
    help?: string,
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
      {help ? <small>{help}</small> : null}
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
        {field(
          "projectId",
          "Project ID",
          "my-project",
          "Must match your project.json ID.",
        )}
        {field(
          "caseId",
          "Case ID",
          "stateDisappears",
          "A stable name for this behavior.",
        )}
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
        <strong>{recording || "Have a screen recording?"}</strong>
        <span>Optional MP4 · up to 10MiB · stays on your computer</span>
        <input
          type="file"
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
        <p className="notice">
          The clip is selected locally, not uploaded or interpreted. Live
          recording intake requires a separate reviewed Meta export through the
          CLI.
        </p>
      ) : null}
    </div>
  );
}

export function ExpectationsStep(props: FieldsProps) {
  const { fields, update } = props;
  const field = makeField(props);
  return (
    <div className="form-fields">
      <label className="field">
        <span>Expected behavior · one statement per line</span>
        <textarea
          rows={5}
          value={fields.expectations}
          onChange={(e) => update("expectations", e.target.value)}
          placeholder="The saved status remains after reopening the page."
        />
        <small>
          Statements become E1, E2, and so on. E1 is the default reproduction
          target; review this in the downloaded case before execution.
        </small>
      </label>
      <div className="two-fields">
        {field("projectPath", "Project configuration", "project.json")}
        {field("workflowPath", "Reviewed workflow", "workflow.json")}
      </div>
      <div className="two-fields">
        {field("casePath", "Where you will save the case", "case.json")}
        {field("candidatePath", "Candidate patch · optional", "repair.patch")}
      </div>
      <label className="field">
        <span>Fixture values · JSON object</span>
        <textarea
          className="mono"
          rows={4}
          value={fields.fixtures}
          onChange={(e) => update("fixtures", e.target.value)}
        />
        <small>
          Use fictional or explicitly approved data. A workflow must assert
          every listed expectation.
        </small>
      </label>
      <p className="notice">
        No correct controls are required in ordinary verification. Without them,
        false-rejection calibration remains unavailable. This form does not
        generate or validate a workflow.
      </p>
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
      <div className="handoff-ready">
        <span>✓</span>
        <div>
          <h3>Draft</h3>
          <p>Nothing has been confirmed or executed.</p>
        </div>
      </div>
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
              "case.json",
              JSON.stringify(review.definition, null, 2) + "\n",
            )
          }
        >
          Download case.json
        </button>
        <button
          className="button button-outline"
          onClick={() =>
            downloadText("report.md", fields.report, "text/markdown")
          }
        >
          Download report.md
        </button>
      </div>
      <ol className="handoff-instructions">
        <li>
          Save the case at the path you specified. Place report.md beside it.
        </li>
        <li>
          Review your project configuration, fixture values, reproduction
          target, and executable workflow.
        </li>
        <li>
          Run the command below from the repository root when you accept that
          scope.
        </li>
      </ol>
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
          {copied ? "Copied ✓" : "Copy "}
        </button>
      </div>
      <p className="notice">
        The command uses explicit developer acceptance. It is not an approval of
        unreviewed files. Results will be available in the run directory printed
        by the CLI.
      </p>
      <Link to="/runs" className="text-link">
        Return to the run library
      </Link>
    </div>
  );
}
