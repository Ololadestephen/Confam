import type { DraftFields } from "./draft.js";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { RegisteredProject } from "../../project/registry.js";
import { apiUrl } from "./api.js";
export async function projectRequest(body?: unknown) {
  const response = await fetch(
    apiUrl("/api/projects"),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Could not load projects.");
  return value as {
    projects?: RegisteredProject[];
    project?: RegisteredProject;
  };
}

export function useProjects() {
  const [projects, setProjects] = useState<RegisteredProject[]>([]);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void projectRequest()
      .then((value) => {
        if (active) setProjects(value.projects ?? []);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function mutate(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const value = await projectRequest(body);
      if (value.project) {
        const project = value.project;
        setProjects((old) => [
          ...old.filter((item) => item.id !== project.id),
          project,
        ]);
        setSelected(project.id);
      }
    } catch (cause) {
      setError((cause as Error).message);
      try {
        setProjects((await projectRequest()).projects ?? []);
      } catch {
        /* Keep the last successfully loaded list. */
      }
    } finally {
      setBusy(false);
    }
  }
  const project = projects.find((item) => item.id === selected);

  return { projects, selected, setSelected, project, busy, error, mutate };
}

export function useImportedProject(
  setFields: Dispatch<SetStateAction<DraftFields>>,
  setError: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("project");
    if (!id) return;
    let active = true;
    void projectRequest({ action: "refresh", id })
      .then(({ project }) => {
        if (!project || project.approvedRevision !== project.revision)
          throw new Error("Review the app setup before using it.");
        if (active)
          setFields((old) => ({
            ...old,
            projectId:
              project.detection.configuration?.id ??
              (project.name
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, "-")
                .replace(/^-+|-+$/g, "") ||
                "my-app"),
            projectPath: project.detection.configPath ?? "",
          }));
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [setFields, setError]);
}
