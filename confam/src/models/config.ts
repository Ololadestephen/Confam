export const META_BASE_URL = "https://api.meta.ai/v1";
export const PRICING_SOURCE = "https://dev.meta.ai/docs/pricing-rate-limits";
export const PRICING_CHECKED_AT = "2026-10-28";
export const DEFAULT_BUDGET_USD = 0.25;
export const NANOUNITS_PER_USD = 1_000_000_000;

// Standard-mode USD per million tokens, expressed as nanodollars per token.
export const MODELS = {
  "muse-spark-1.3": { input: 1250, cachedInput: 150, output: 4250 },
  "muse-wonder-1.0": { input: 4000, cachedInput: 200, output: 20000 },
} as const;
export type ModelId = keyof typeof MODELS;
export type ModelStage = "intake" | "checks" | "decoys" | "strengthen" | "verdict" | "fixer" | "explore";
export const STAGE_MODELS: Record<ModelStage, ModelId> = {
  intake: "muse-spark-1.3", checks: "muse-spark-1.3", decoys: "muse-spark-1.3", verdict: "muse-spark-1.3",
  strengthen: "muse-spark-1.3",
  fixer: "muse-wonder-1.0", explore: "muse-wonder-1.0",
};

export function budgetNanounits(usd: number): number {
  const value = Math.floor(usd * NANOUNITS_PER_USD);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Budget must be a positive, finite USD amount.");
  return value;
}
