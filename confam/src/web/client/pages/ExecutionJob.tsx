import { useState } from "react";
import { useExecutionJob } from "../jobs-state.js";
import { Link, PageTitle } from "../shared.js";
import { JobProgress, JobReview } from "./ExecutionJobDetails.js";

export default function ExecutionJob({
  draftId,
  jobId,
}: {
  draftId?: string;
  jobId?: string;
}) {
  const { job, jobs, error, busy, mutate } = useExecutionJob(draftId, jobId);
  const [candidate, setCandidate] = useState<{ name: string; text: string }>();
  const [fileError, setFileError] = useState("");
  const [approved, setApproved] = useState(false);
  async function selectFile(file?: File) {
    setCandidate(undefined);
    setFileError("");
    if (!file) return;
    if (!/\.(patch|diff)$/i.test(file.name)) {
      setFileError("Choose a .patch or .diff file.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setFileError("The patch must be no larger than 1 MiB.");
      return;
    }
    try {
      setCandidate({ name: file.name, text: await file.text() });
    } catch {
      setFileError("Could not read the selected patch.");
    }
  }
  return (
    <main id="main" className="workspace">
      <PageTitle
        eyebrow="Verification"
        title={
          job ? `Review ${job.preview.projectName}.` : "Prepare verification."
        }
      >
        Review the exact snapshot before running it.
      </PageTitle>
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
      {!job && !jobId && (
        <section className="form-panel">
          <h2>
            Candidate patch <span className="pill">Optional</span>
          </h2>
          <p>
            Choose a local patch to test. Preparing the preview does not run the
            application or call a model.
          </p>
          <label className="form-field">
            Patch file
            <input
              type="file"
              accept=".patch,.diff"
              onChange={(event) => void selectFile(event.target.files?.[0])}
            />
          </label>
          {candidate && <p>{candidate.name}</p>}
          {fileError && (
            <p className="error-note" role="alert">
              {fileError}
            </p>
          )}
          <button
            className="button button-dark"
            disabled={busy || !draftId || !!fileError}
            onClick={() =>
              void mutate({
                action: "preview",
                draftId,
                ...(candidate ? { candidate } : {}),
              })
            }
          >
            Prepare execution preview
          </button>
          {jobs.length > 0 && (
            <>
              <h3>Previous jobs for this draft</h3>
              <ul>
                {jobs.map((item) => (
                  <li key={item.id}>
                    <Link to={`/jobs/${encodeURIComponent(item.id)}`}>
                      {item.status} · {item.createdAt}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {job?.status === "ready" && (
        <JobReview
          job={job}
          approved={approved}
          setApproved={setApproved}
          busy={busy}
          start={() =>
            void mutate({
              action: "start",
              id: job.id,
              hash: job.preview.hash,
              approve: true,
            })
          }
        />
      )}
      {job && job.status !== "ready" && (
        <JobProgress
          job={job}
          busy={busy}
          cancel={() => void mutate({ action: "cancel", id: job.id })}
        />
      )}
    </main>
  );
}
