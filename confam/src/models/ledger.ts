import { rename, writeFile } from "node:fs/promises";
import { z } from "zod";
import { readJson } from "../engine/json.js";
import { MODELS, NANOUNITS_PER_USD, PRICING_CHECKED_AT, PRICING_SOURCE, budgetNanounits, type ModelId, type ModelStage } from "./config.js";

const count = z.number().int().nonnegative().safe();
const entrySchema = z.object({
  stage: z.enum(["intake", "checks", "decoys", "strengthen", "verdict", "fixer", "explore"]),
  model: z.enum(["muse-spark-1.3", "muse-wonder-1.0"]),
  state: z.enum(["reserved", "settled", "uncertain"]),
  reservedNanounits: count,
  costNanounits: count.optional(),
  inputTokens: count.optional(), outputTokens: count.optional(), cachedTokens: count.optional(),
  startedAt: z.string(), durationMs: count.optional(),
});
const ledgerSchema = z.object({
  schemaVersion: z.literal(1), mode: z.enum(["live", "fixture"]),
  capNanounits: count, entries: z.array(entrySchema),
});
type LedgerState = z.infer<typeof ledgerSchema>;
export interface TokenUsage { input: number; output: number; cached: number; }

export class BudgetExceededError extends Error {
  constructor() { super("Per-run model budget cannot cover the next request; no generation was sent."); this.name = "BudgetExceededError"; }
}
export class UnknownUsageError extends Error {
  constructor() { super("Model usage is uncertain; the request reservation is retained and further calls are stopped."); }
}

export class CostLedger {
  private constructor(readonly file: string, private readonly state: LedgerState) { }

  static async create(file: string, capUsd: number, mode: LedgerState["mode"]): Promise<CostLedger> {
    const ledger = new CostLedger(file, { schemaVersion: 1, mode, capNanounits: budgetNanounits(capUsd), entries: [] });
    await ledger.save();
    return ledger;
  }

  static async load(file: string): Promise<CostLedger> {
    return new CostLedger(file, ledgerSchema.parse(await readJson(file)));
  }

  get mode() { return this.state.mode; }

  snapshot() {
    const used = this.state.entries.reduce((total, entry) => total + (entry.costNanounits ?? entry.reservedNanounits), 0);
    return {
      ...structuredClone(this.state), pricingSource: PRICING_SOURCE, pricingCheckedAt: PRICING_CHECKED_AT,
      budgetUsedUsd: used / NANOUNITS_PER_USD,
      estimatedSpendUsd: this.mode === "live" ? this.state.entries.reduce((total, entry) => total + (entry.costNanounits ?? 0), 0) / NANOUNITS_PER_USD : 0,
      hasUncertainUsage: this.state.entries.some(({ state }) => state !== "settled"),
    };
  }

  async reserve(stage: ModelStage, model: ModelId, inputTokens: number, maxOutputTokens: number): Promise<number> {
    count.parse(inputTokens); count.parse(maxOutputTokens);
    if (this.state.entries.some(({ state }) => state !== "settled")) throw new UnknownUsageError();
    const rates = MODELS[model];
    const reservedNanounits = inputTokens * rates.input + maxOutputTokens * rates.output;
    count.parse(reservedNanounits);
    const used = this.state.entries.reduce((total, entry) => total + (entry.costNanounits ?? entry.reservedNanounits), 0);
    if (used + reservedNanounits > this.state.capNanounits) throw new BudgetExceededError();
    this.state.entries.push({ stage, model, state: "reserved", reservedNanounits, startedAt: new Date().toISOString() });
    await this.save();
    return this.state.entries.length - 1;
  }

  async settle(index: number, usage: TokenUsage, durationMs: number): Promise<void> {
    const entry = this.state.entries[index];
    if (!entry || entry.state !== "reserved") throw new Error("No pending model reservation.");
    count.parse(usage.input); count.parse(usage.output); count.parse(usage.cached);
    if (usage.cached > usage.input) throw new Error("Cached token count exceeds input usage.");
    const rates = MODELS[entry.model];
    const costNanounits = (usage.input - usage.cached) * rates.input + usage.cached * rates.cachedInput + usage.output * rates.output;
    count.parse(costNanounits);
    if (costNanounits > entry.reservedNanounits) {
      Object.assign(entry, { state: "uncertain", costNanounits, inputTokens: usage.input, outputTokens: usage.output, cachedTokens: usage.cached, durationMs });
      await this.save();
      throw new Error("Reported cost exceeds the preflight reservation; recorded the overrun and stopped further calls.");
    }
    Object.assign(entry, { state: "settled", costNanounits, inputTokens: usage.input, outputTokens: usage.output, cachedTokens: usage.cached, durationMs });
    await this.save();
  }

  async markUncertain(index: number, durationMs: number): Promise<void> {
    const entry = this.state.entries[index];
    if (entry?.state === "reserved") { entry.state = "uncertain"; entry.durationMs = durationMs; await this.save(); }
  }

  private async save(): Promise<void> {
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, JSON.stringify(this.snapshot(), null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, this.file);
  }
}
