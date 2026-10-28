import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ModelClient, createMetaTransport, type ModelTransport } from "./client.js";
import { CostLedger } from "./ledger.js";

const directories: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const schema = z.strictObject({ ready: z.boolean() });
async function fixture(cap = 1) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-model-"));
  directories.push(directory);
  const ledger = await CostLedger.create(path.join(directory, "usage.json"), cap, "live");
  const transport: ModelTransport = {
    mode: "live", count: vi.fn().mockResolvedValue(1000),
    generate: vi.fn().mockResolvedValue({ text: '{"ready":true}', completed: true, usage: { input: 500, output: 50, cached: 100 } }),
  };
  return { ledger, transport, client: new ModelClient(ledger, transport) };
}

describe("budgeted model client", () => {
  it("records per-stage usage and cached input without counting it twice", async () => {
    const { client, ledger, transport } = await fixture();
    expect(await client.structured("intake", "instructions", "input", schema, 100)).toEqual({ ready: true });
    expect(ledger.snapshot().estimatedSpendUsd).toBe(0.0007275);
    expect(ledger.snapshot().entries[0]).toMatchObject({ stage: "intake", model: "muse-spark-1.3", inputTokens: 500, outputTokens: 50, cachedTokens: 100, state: "settled" });
    expect(vi.mocked(transport.generate).mock.calls[0]?.[0].maxOutputTokens).toBe(100);
    const reloaded = await CostLedger.load(ledger.file);
    expect(reloaded.snapshot().budgetUsedUsd).toBe(ledger.snapshot().budgetUsedUsd);
  });

  it("refuses a request before generation when its upper bound does not fit", async () => {
    const { client, ledger, transport } = await fixture(0.000001);
    await expect(client.structured("checks", "instructions", "input", schema)).rejects.toThrow("budget");
    expect(transport.generate).not.toHaveBeenCalled();
    expect(ledger.snapshot().entries).toHaveLength(0);
  });

  it("routes fixer work to Wonder while ordinary authoring remains on Spark", async () => {
    const { client, ledger, transport } = await fixture();
    await client.structured("fixer", "instructions", "input", schema, 100);
    expect(vi.mocked(transport.generate).mock.calls[0]?.[0].model).toBe("muse-wonder-1.0");
    expect(ledger.snapshot().entries[0]?.costNanounits).toBe(2620000);
  });

  it.each(["missing", "network"])("retains a reservation and stops after %s usage", async (failure) => {
    const { client, ledger, transport } = await fixture();
    if (failure === "missing") vi.mocked(transport.generate).mockResolvedValue({ text: "{}", completed: true });
    else vi.mocked(transport.generate).mockRejectedValue(new Error("network"));
    await expect(client.structured("intake", "instructions", "input", schema, 100)).rejects.toThrow();
    expect(ledger.snapshot().hasUncertainUsage).toBe(true);
    expect(ledger.snapshot().budgetUsedUsd).toBeGreaterThan(0);
    await expect(client.structured("intake", "instructions", "input", schema, 100)).rejects.toThrow("uncertain");
    expect(transport.generate).toHaveBeenCalledTimes(1);
  });

  it("records a provider overrun honestly and stops rather than hiding the extra usage", async () => {
    const { client, ledger, transport } = await fixture();
    vi.mocked(transport.generate).mockResolvedValue({ text: '{"ready":true}', completed: true, usage: { input: 100_000, output: 50, cached: 0 } });
    await expect(client.structured("checks", "instructions", "input", schema, 100)).rejects.toThrow("overrun");
    expect(ledger.snapshot().entries[0]).toMatchObject({ state: "uncertain", inputTokens: 100_000, costNanounits: 125212500 });
  });

  it.each(["invalid-json", "wrong-schema", "incomplete"])("rejects %s output while retaining its measured cost", async (failure) => {
    const { client, ledger, transport } = await fixture();
    vi.mocked(transport.generate).mockResolvedValue({ text: failure === "invalid-json" ? "not json" : '{"unexpected":1}', completed: failure !== "incomplete", usage: { input: 500, output: 50, cached: 0 } });
    await expect(client.structured("checks", "instructions", "input", schema, 100)).rejects.toThrow();
    expect(ledger.snapshot().entries[0]?.state).toBe("settled");
    expect(ledger.snapshot().estimatedSpendUsd).toBeGreaterThan(0);
  });

  it("rejects concurrent calls for one client", async () => {
    const { client, transport } = await fixture();
    let complete!: (count: number) => void;
    vi.mocked(transport.count).mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const first = client.structured("intake", "instructions", "input", schema, 100);
    await expect(client.structured("intake", "instructions", "input", schema, 100)).rejects.toThrow("sequential");
    complete(1000);
    await first;
  });

  it("does not mix fixture accounting with a live transport", async () => {
    const { ledger, transport } = await fixture();
    expect(() => new ModelClient(ledger, { ...transport, mode: "fixture" })).toThrow("mode");
    expect(() => createMetaTransport(" ")).toThrow("MODEL_API_KEY");
  });

  it("uses the documented Meta routes and SDK response parsing without real network calls", async () => {
    const fetch = vi.fn(async (request: string | URL | Request, options?: RequestInit) => {
      const url = String(request);
      const body = JSON.parse(String(options?.body));
      expect(body.model).toBe("muse-spark-1.3");
      expect(body.text.format.type).toBe("json_schema");
      if (url.endsWith("/responses/input_tokens")) {
        expect(body.max_output_tokens).toBeUndefined();
        return new Response(JSON.stringify({ input_tokens: 1000 }), { headers: { "content-type": "application/json" } });
      }
      expect(url).toBe("https://api.meta.ai/v1/responses");
      expect(body.max_output_tokens).toBe(100);
      return new Response(JSON.stringify({
        id: "response-test", status: "completed", object: "response", model: body.model,
        output: [{ id: "message-test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"ready":true}', annotations: [] }] }],
        usage: { input_tokens: 500, output_tokens: 50, total_tokens: 550, input_tokens_details: { cached_tokens: 0 } },
      }), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetch);
    const { ledger } = await fixture();
    const client = new ModelClient(ledger, createMetaTransport("dummy-test-key"));
    expect(await client.structured("intake", "instructions", "input", schema, 100)).toEqual({ ready: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
