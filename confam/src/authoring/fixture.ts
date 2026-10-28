import { fileURLToPath } from "node:url";
import path from "node:path";
import { readJson } from "../engine/json.js";
import type { ModelTransport, StructuredRequest } from "../models/client.js";

// Test/demo responses are scripted and never presented as live model inference.
export function fixtureTransport(): ModelTransport {
  const directory = fileURLToPath(new URL("../../fixtures/day3/", import.meta.url));
  const inputTokens = (request: StructuredRequest) => Math.ceil(Buffer.byteLength(JSON.stringify(request)) / 2) + 100;
  return {
    mode: "fixture",
    async count(request) { return inputTokens(request); },
    async generate(request) {
      if (!["intake", "checks", "decoys", "fixer"].includes(request.stage)) throw new Error("No fixture is defined for this stage.");
      const file = request.stage === "fixer" ? fileURLToPath(new URL("../../fixtures/day4/fixer.json", import.meta.url)) : path.join(directory, `${request.stage}.json`);
      const text = JSON.stringify(await readJson(file));
      const output = Math.ceil(Buffer.byteLength(text) / 2);
      if (output > request.maxOutputTokens) throw new Error("Fixture exceeds its simulated output budget.");
      return { text, completed: true, usage: { input: inputTokens(request), output, cached: 0 } };
    },
  };
}
