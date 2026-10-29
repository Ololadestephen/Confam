import { useEffect, useState } from "react";
import { projectRequest } from "./projects-state.js";
import type {
  OnboardingSession,
  ReviewedRequirements,
} from "../../onboarding/contracts.js";
import { apiUrl } from "./api.js";

export async function onboardingRequest(
  body?: unknown,
  id?: string,
): Promise<OnboardingSession> {
  const path = id
    ? `/api/onboarding?id=${encodeURIComponent(id)}`
    : "/api/onboarding";
  const response = await fetch(
    apiUrl(path),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error ?? "Onboarding request failed.");
  return value.session as OnboardingSession;
}

export function parseDraftJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

export function initialReview(
  session: OnboardingSession,
): ReviewedRequirements {
  if (session.reviewed) return session.reviewed;
  const proposal = session.requirements;
  return {
    expectations: proposal?.expectations ?? [],
    fixtures: proposal?.fixtures ?? {},
    reproductionTargets: [],
    answers: (proposal?.questions ?? []).map((question) => ({
      question,
      answer: "",
    })),
  };
}

export async function encodeRecording(
  file: File,
): Promise<{ name: string; dataBase64: string }> {
  if (!file.name.toLowerCase().endsWith(".mp4") || file.size > 10 * 1024 * 1024)
    throw new Error("Choose an MP4 up to 10 MiB.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  return { name: file.name, dataBase64: data.slice(data.indexOf(",") + 1) };
}

export function newCaseId() {
  return `case_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function useReportBuilder(projectId: string) {
  const [session, setSession] = useState<OnboardingSession>();
  const [ready, setReady] = useState(false);
  const [caseId, setCaseId] = useState(newCaseId);
  const [projectName, setProjectName] = useState("");
  const [report, setReport] = useState("");
  const [recording, setRecording] = useState<File>();
  const [approved, setApproved] = useState(false);
  const [review, setReview] = useState<ReviewedRequirements>({
    expectations: [],
    fixtures: {},
    reproductionTargets: [],
    answers: [],
  });
  const [fixtures, setFixtures] = useState("{}");
  const [workflow, setWorkflow] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  function applySession(next: OnboardingSession) {
    setSession(next);
    setApproved(false);
    if (next.requirements || next.reviewed) {
      const initial = initialReview(next);
      setReview(initial);
      setFixtures(JSON.stringify(initial.fixtures, null, 2));
    }
    if (next.workflow) setWorkflow(JSON.stringify(next.workflow, null, 2));
    const url = new URL(window.location.href);
    url.searchParams.set("draft", next.id);
    window.history.replaceState(null, "", url);
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { project } = await projectRequest({
          action: "refresh",
          id: projectId,
        });
        if (
          !project ||
          project.approvedRevision !== project.revision ||
          !project.detection.configuration
        )
          throw new Error(
            "Review and approve this app's configuration before creating a report.",
          );
        if (!active) return;
        setProjectName(project.name);
        setReady(true);
        const id = new URLSearchParams(window.location.search).get("draft");
        if (id) {
          const loaded = await onboardingRequest(undefined, id);
          if (loaded.projectId !== projectId)
            throw new Error("This draft belongs to another app.");
          if (active) applySession(loaded);
        }
      } catch (cause) {
        if (active) setError((cause as Error).message);
      } finally {
        if (active) setBusy(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [projectId]);
  async function run(action: () => Promise<OnboardingSession>) {
    setBusy(true);
    setError("");
    try {
      applySession(await action());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    await run(async () => {
      const { project } = await projectRequest({
        action: "refresh",
        id: projectId,
      });
      if (
        !project ||
        project.approvedRevision !== project.revision ||
        !project.detection.configuration
      )
        throw new Error(
          "Review and approve this app's configuration before creating a report.",
        );
      return onboardingRequest({
        action: "preview",
        projectId,
        caseId,
        report,
        ...(recording ? { recording: await encodeRecording(recording) } : {}),
      });
    });
  }
  function submitReview() {
    void run(async () => {
      if (!session || !review) throw new Error("Requirements are unavailable.");
      const parsed = parseDraftJson(fixtures, "Fixtures");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Fixtures must be a JSON object.");
      if (
        !review.reproductionTargets.length ||
        review.answers.some((item) => !item.answer.trim()) ||
        review.expectations.some((item) => !item.statement.trim())
      )
        throw new Error(
          "Choose a reproduction target and complete every expectation and answer.",
        );
      return onboardingRequest({
        action: "workflow",
        id: session.id,
        ...review,
        fixtures: parsed,
      });
    });
  }
  return {
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
  };
}
