import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { z } from "zod";
import { META_BASE_URL, STAGE_MODELS, type ModelStage } from "./config.js";
import { CostLedger, type TokenUsage } from "./ledger.js";

export interface StructuredRequest {
  stage: ModelStage;
  model: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
}
export interface ModelResponse {
  text: string;
  completed: boolean;
  usage?: TokenUsage;
}
export interface ModelTransport {
  mode: "live" | "fixture";
  count(request: StructuredRequest): Promise<number>;
  generate(request: StructuredRequest): Promise<ModelResponse>;
}

function responseBody(request: StructuredRequest): ResponseCreateParamsNonStreaming {
  return {
    model: request.model, instructions: request.instructions, input: request.input,
    max_output_tokens: request.maxOutputTokens, reasoning: { effort: "low" }, store: false,
    text: { format: { type: "json_schema", name: request.stage, strict: true, schema: request.schema } },
  };
}

export function createMetaTransport(apiKey: string): ModelTransport {
  if (!apiKey.trim()) throw new Error("MODEL_API_KEY is not set. Add it to the project's .env yourself.");
  const sdk = new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 0, timeout: 60_000 });
  return {
    mode: "live",
    async count(request) {
      try {
        const body = responseBody(request);
        const { model, instructions, input, text, reasoning } = body;
        const result = await sdk.post<unknown>("/responses/input_tokens", { body: { model, instructions, input, text, reasoning } });
        return z.object({ input_tokens: z.number().int().nonnegative().safe() }).parse(result).input_tokens;
      } catch { throw new Error("Meta token preflight failed; no generation was sent. Check API access and credentials."); }
    },
    async generate(request) {
      try {
        const response = await sdk.responses.create(responseBody(request));
        return {
          text: response.output_text, completed: response.status === "completed",
          usage: response.usage ? {
            input: response.usage.input_tokens, output: response.usage.output_tokens,
            cached: response.usage.input_tokens_details?.cached_tokens ?? 0,
          } : undefined,
        };
      } catch { throw new Error("Meta generation failed; usage is uncertain. Automatic retries are disabled."); }
    },
  };
}

export class ModelClient {
  private busy = false;
  constructor(readonly ledger: CostLedger, private readonly transport: ModelTransport) {
    if (ledger.mode !== transport.mode) throw new Error("Model transport mode does not match the cost ledger.");
  }

  async structured<T>(stage: ModelStage, instructions: string, input: string, schema: z.ZodType<T>, maxOutputTokens = 4096): Promise<T> {
    if (this.busy) throw new Error("Model calls for a run must be sequential.");
    this.busy = true;
    let reservation: number | undefined;
    const started = Date.now();
    try {
      if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) throw new Error("Invalid output token limit.");
      const request: StructuredRequest = { stage, model: STAGE_MODELS[stage], instructions, input, schema: z.toJSONSchema(schema), maxOutputTokens };
      const inputTokens = await this.transport.count(request);
      reservation = await this.ledger.reserve(stage, STAGE_MODELS[stage], inputTokens, maxOutputTokens);
      const response = await this.transport.generate(request);
      if (!response.usage) throw new Error("Model response has no token usage; further requests are stopped.");
      await this.ledger.settle(reservation, response.usage, Date.now() - started);
      if (!response.completed) throw new Error("Model response was incomplete or refused; no output was accepted.");
      let parsed: unknown;
      try { parsed = JSON.parse(response.text); }
      catch { throw new Error("Model returned invalid JSON; no output was accepted."); }
      const result = schema.safeParse(parsed);
      if (!result.success) throw new Error("Model output does not match the required schema; no output was accepted.");
      return result.data;
    } catch (error) {
      if (reservation !== undefined) await this.ledger.markUncertain(reservation, Date.now() - started);
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
