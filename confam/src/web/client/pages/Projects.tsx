import { useState } from "react";
import { useProjects } from "../projects-state.js";
import { ProjectDetails } from "./ProjectDetails.js";
import { PageTitle } from "../shared.js";

export default function Projects() {
  const [folder, setFolder] = useState("");
  const { projects, selected, setSelected, project, busy, error, mutate } =
    useProjects();
  return (
    <main id="main" className="workspace">
      <PageTitle eyebrow="Your applications" title="Choose an app.">
        Add a local folder. Confam detects the setup without running it.
      </PageTitle>
      <form
        className="panel form-fields"
        onSubmit={(event) => {
          event.preventDefault();
          void mutate({ action: "add", root: folder });
        }}
      >
        <label className="field">
          <span>App folder</span>
          <input
            aria-label="App folder"
            required
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            placeholder="/Users/you/Projects/my-app"
            autoComplete="off"
          />
        </label>
        <p>
          The folder must be on the computer running Confam. Files stay local;
          no commands run during import.
        </p>
        <div>
          <button className="button button-dark" disabled={busy}>
            Add app
          </button>
        </div>
      </form>
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
      <section className="section-block">
        <h2>Saved apps</h2>
        {!projects.length && <p>No apps added yet.</p>}
        <div className="two-columns">
          {projects.map((item) => (
            <button
              type="button"
              className="panel project-choice"
              key={item.id}
              aria-pressed={selected === item.id}
              disabled={busy}
              onClick={() => {
                setSelected(undefined);
                void mutate({ action: "refresh", id: item.id });
              }}
            >
              <strong>{item.name}</strong>
              <span>{item.detection.kind}</span>
              <code>{item.root}</code>
              <span>
                {item.approvedRevision === item.revision
                  ? "Review saved"
                  : "Needs review"}
              </span>
            </button>
          ))}
        </div>
      </section>
      {project && (
        <ProjectDetails project={project} busy={busy} mutate={mutate} />
      )}
    </main>
  );
}
