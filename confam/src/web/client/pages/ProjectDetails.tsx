import type { RegisteredProject } from "../../../project/registry.js";
import { Data, Link } from "../shared.js";
export function ProjectDetails({
  project,
  busy,
  mutate,
}: {
  project: RegisteredProject;
  busy: boolean;
  mutate: (body: unknown) => Promise<void>;
}) {
  return (
    <section className="panel form-fields" aria-label="Detected setup">
      <h2>{project.name}</h2>
      <p>{project.detection.kind}</p>
      {project.detection.commands.map((item, index) => (
        <Data key={index} title={item.label} value={item} open />
      ))}
      {project.detection.configPath && (
        <Data
          title="Project configuration"
          value={project.detection.configuration}
          open
        />
      )}
      <ul>
        {project.detection.issues.map((issue, index) => (
          <li key={index}>{issue}</li>
        ))}
      </ul>
      {!project.detection.configPath && (
        <p className="notice">
          No valid Confam project configuration was detected. Verification needs
          a project configuration for source files, readiness, port, and
          isolated test data. These cannot be safely inferred from the start
          script alone. You can prepare a bug report now; execution remains
          unavailable here.
        </p>
      )}
      <p>
        Reviewing saves this setup. Runtime checks and application execution
        remain separate CLI actions.
      </p>
      <div className="button-row">
        <button
          disabled={busy}
          className="button button-outline"
          onClick={() => void mutate({ action: "refresh", id: project.id })}
        >
          Detect again
        </button>
        {project.approvedRevision !== project.revision ? (
          <button
            disabled={busy}
            className="button button-dark"
            onClick={() =>
              void mutate({
                action: "approve",
                id: project.id,
                revision: project.revision,
              })
            }
          >
            Mark setup reviewed
          </button>
        ) : (
          <Link
            className="button button-dark"
            to={`/runs/new?project=${project.id}`}
          >
            Describe the bug
          </Link>
        )}
      </div>
    </section>
  );
}
