import { useEffect, useState } from "react";
import { apiUrl } from "./api.js";

export interface GapCounts {
  proposed: number;
  confirmed: number;
  rejected: number;
  undecided: number;
}
export interface GapReviewSummary {
  id: string;
  created: string;
  costUsd?: number;
  previewOnly?: boolean;
  unreadable?: boolean;
  decisionsUnreadable?: boolean;
  project?: string;
  caseId?: string;
  mode?: string;
  reviewedCandidate?: boolean | null;
  counts?: GapCounts;
}
export interface GapItem {
  id: string;
  statement: string;
  why: string;
  scenario: string;
  decision: "confirmed" | "rejected" | null;
  decisionNote?: string;
  decidedAt?: string;
}
export interface GapReview {
  id: string;
  created: string;
  previewOnly: boolean;
  project?: string;
  caseId?: string;
  mode?: string;
  status?: string;
  reviewedCandidate?: boolean | null;
  approvedExportHash?: string;
  note?: string;
  costUsd?: number;
  counts?: GapCounts;
  gaps: GapItem[];
  sent?: { instructions?: string; sources: string[]; proposedFix: boolean };
}
export interface RepairResult {
  caseId?: string;
  expectationIds: string[];
  outcome: string;
  unmet: string[];
  evidence?: string;
  mode?: string;
}
export interface RepairSession {
  id: string;
  created: string;
  unreadable: boolean;
  suite?: string;
  project?: string;
  status?: string;
  maxRounds?: number;
  pending?: {
    stage?: string;
    round?: number;
    exportFile?: string;
    exportHash?: string;
  } | null;
  rounds?: {
    round?: number;
    fixFolder?: string;
    patchFile?: string;
    patchHash?: string;
    results: RepairResult[];
  }[];
  reviewId?: string;
  outcome?: string | null;
  spendUsd?: number;
}
export interface RepairSummary {
  id: string;
  created: string;
  unreadable: boolean;
  project?: string;
  suite?: string;
  status?: string;
  outcome?: string | null;
  rounds?: number;
  spendUsd?: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init);
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("The local server returned an unreadable answer.");
  }
  if (!response.ok)
    throw new Error(
      (value as { error?: string }).error ??
        "This review could not be read. Open the URL printed by the CLI.",
    );
  return value as T;
}

export function reviewedLabel(value: boolean | null | undefined) {
  return value === true
    ? "A proposed fix"
    : value === false
      ? "Current code"
      : "Not recorded";
}
/** Shows the last two segments of a recorded file path, e.g. "mosaic/repair.json". */
export function shortPath(value: string | undefined) {
  if (!value) return undefined;
  return value.split(/[\\/]/).filter(Boolean).slice(-2).join("/");
}
export function dollars(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value.toFixed(4)}`
    : "Not recorded";
}

function useLoad<T>(path: string) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    request<T>(path)
      .then((data) => {
        if (active) setValue(data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [path]);
  return { value, setValue, error };
}

export function useGapReviews() {
  const gaps = useLoad<{ reviews: GapReviewSummary[]; truncated?: boolean }>(
    "/api/gaps",
  );
  const repairs = useLoad<{ sessions: RepairSummary[] }>("/api/repairs");
  return {
    reviews: gaps.value?.reviews,
    truncated: gaps.value?.truncated === true,
    error: gaps.error,
    sessions: repairs.value?.sessions ?? [],
  };
}

export function useGapReview(id: string) {
  const { value, setValue, error } = useLoad<{ review: GapReview }>(
    `/api/gaps/${encodeURIComponent(id)}`,
  );
  const [busy, setBusy] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  async function decide(
    gapId: string,
    decision: "confirmed" | "rejected",
    note: string,
  ) {
    setBusy(gapId);
    setSaveError(undefined);
    try {
      const saved = await request<{ review: GapReview }>(
        `/api/gaps/${encodeURIComponent(id)}/decisions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: gapId,
            decision,
            ...(note.trim() ? { note: note.trim() } : {}),
          }),
        },
      );
      setValue(saved);
    } catch (cause) {
      setSaveError((cause as Error).message);
    } finally {
      setBusy(undefined);
    }
  }
  return { review: value?.review, error, busy, saveError, decide };
}

export function useRepairSession(id: string) {
  const { value, error } = useLoad<{ session: RepairSession }>(
    `/api/repairs/${encodeURIComponent(id)}`,
  );
  return { session: value?.session, error };
}
