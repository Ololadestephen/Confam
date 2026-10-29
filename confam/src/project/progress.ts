export interface VerificationProgress {
  phase: "preparing" | "frozen" | "variant-start" | "runtime-ready" | "step" | "variant-finish" | "finished";
  variantId?: string;
  kind?: "original" | "control" | "candidate";
  stepIndex?: number;
  action?: string;
  outcome?: string;
  reportPath?: string;
}

export function emitProgress(callback: ((event: VerificationProgress) => void) | undefined, event: VerificationProgress): void {
  try { callback?.(event); } catch { /* Progress consumers cannot affect verification. */ }
}
