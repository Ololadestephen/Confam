export interface ArtifactLink { url: string; label: string; kind?: string; }
export interface VariantView {
  id: string;
  kind: string;
  outcome: string;
  expectationId?: string;
  assertions: unknown[];
  probes: Record<string, unknown>;
  steps: unknown[];
  videos: ArtifactLink[];
  traces: ArtifactLink[];
  patch?: ArtifactLink;
  logs?: ArtifactLink;
  error?: string;
}
export interface RunView {
  runId: string;
  project: string;
  caseId: string;
  status: string;
  verdict: string;
  inputReport?: string;
  durationMs?: number;
  fixture: boolean;
  expectations: { id: string; statement: string; }[];
  limitations: string[];
  development?: { caught: number; survived: number; uncounted: number; total: number; };
  independent: { evaluated: boolean; counts?: unknown; arms?: unknown; complete?: boolean; label: string; };
  variants: VariantView[];
  files: ArtifactLink[];
  modelUsage?: unknown;
  versions?: unknown;
  recording?: ArtifactLink;
  observations?: unknown;
}
