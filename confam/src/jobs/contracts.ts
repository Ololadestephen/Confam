import type { CaseDefinition } from "../project/case.js";
import type { ProjectConfig } from "../project/config.js";
import type { WorkflowPlan } from "../workflows/schema.js";
import type { VerificationProgress } from "../project/progress.js";
import type { SnapshotManifest } from "./snapshot.js";
export interface ExecutionPreview {
  hash: string;
  toolHash: string;
  runsDirectory: string;
  report: string;
  recording?: { sha256: string; bytes: number };
  projectName: string;
  caseId: string;
  root: string;
  command: string[];
  manifest: SnapshotManifest;
  configuration: ProjectConfig;
  definition: CaseDefinition;
  workflow: WorkflowPlan;
  confirmationHash: string;
  candidate?: { name: string; text: string; sha256: string; bytes: number };
  limitations: string[];
}
export interface ExecutionEvent extends VerificationProgress {
  sequence: number;
  at: string;
}
export interface ExecutionJob {
  id: string;
  draftId: string;
  status:
    | "ready"
    | "running"
    | "cancelling"
    | "completed"
    | "blocked"
    | "error"
    | "cancelled"
    | "interrupted";
  preview: ExecutionPreview;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  phase?: string;
  events: ExecutionEvent[];
  runId?: string;
  verdict?: string;
  error?: string;
  cleanupComplete?: boolean;
}
