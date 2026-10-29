import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { analyzeRecording } from "./intake.js";
import { sampleMp4 } from "./fixtures.test-helper.js";
import type { ModelTransport } from "../models/client.js";

const proposal = {
  source: "recording", observations: [{ timestampSeconds: 1, description: "The visible status changes", confidence: "high" }],
  actions: [{ timestampSeconds: 0.5, description: "The user clicks a button" }], expectedBehaviorSuggestions: ["The developer should confirm whether the state must persist"], uncertainties: ["The database is not visible"]
};
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-recording-"));
  const clip = path.join(directory, "clip.mp4"), report = path.join(directory, "report.md");
  await writeFile(clip, sampleMp4()); await writeFile(report, "The state disappears after reopening.");
  return { directory, clip, report };
}
it("sends actual validated video through preflight and generation, preserving review-only provenance", async () => {
  const { directory, clip, report } = await fixture();
  try {
    let counted = "", generated = "";
    const transport: ModelTransport = {
      mode: "fixture", count: async (request) => { counted = request.video?.dataUrl ?? ""; return 100; },
      generate: async (request) => { generated = request.video?.dataUrl ?? ""; return { text: JSON.stringify(proposal), completed: true, usage: { input: 100, output: 100, cached: 0 } }; }
    };
    const result = await analyzeRecording(clip, report, path.join(directory, "runs"), 0.25, transport);
    expect(result.status).toBe("needs-review"); expect(counted).toBe(generated); expect(counted).toContain(sampleMp4().toString("base64"));
    const manifestText = await readFile(result.manifestPath, "utf8");
    expect(manifestText).not.toContain("base64");
    expect(JSON.parse(manifestText)).toMatchObject({ source: "recording", mode: "fixture", confirmationRequired: true, recording: { path: "recording.mp4", durationSeconds: 2 } });
    expect(result.usage?.estimatedSpendUsd).toBe(0);
    expect(await readFile(path.join(result.directory, "recording.mp4"))).toEqual(sampleMp4());
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it("uses an explicit text fallback for unsupported media without calling a model", async () => {
  const { directory, clip, report } = await fixture();
  try {
    await writeFile(clip, "This is not actually an MP4 recording.");
    let requested = false;
    const transport: ModelTransport = { mode: "fixture", count: async () => { requested = true; return 1; }, generate: async () => { throw new Error("must not generate"); } };
    const result = await analyzeRecording(clip, report, path.join(directory, "runs"), 0.25, transport);
    expect(requested).toBe(false); expect(result.status).toBe("text-fallback"); expect(result.proposalPath).toBeUndefined();
    expect(JSON.parse(await readFile(result.manifestPath, "utf8"))).toMatchObject({ source: "text", confirmationRequired: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it("does not silently substitute a fabricated video result when the API fails", async () => {
  const { directory, clip, report } = await fixture();
  try {
    const transport: ModelTransport = { mode: "fixture", count: async () => 100, generate: async () => { throw new Error("transport unavailable"); } };
    const result = await analyzeRecording(clip, report, path.join(directory, "runs"), 0.25, transport);
    expect(result.status).toBe("text-fallback"); expect(result.proposalPath).toBeUndefined();
    expect(result.usage?.hasUncertainUsage).toBe(true);
    expect(await readFile(path.join(result.directory, "report.md"), "utf8")).toContain("disappears");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it("rejects observations beyond the clip even when the model schema is valid", async () => {
  const { directory, clip, report } = await fixture();
  try {
    const transport: ModelTransport = { mode: "fixture", count: async () => 100, generate: async () => ({ text: JSON.stringify({ ...proposal, observations: [{ ...proposal.observations[0], timestampSeconds: 100 }] }), completed: true, usage: { input: 100, output: 100, cached: 0 } }) };
    const result = await analyzeRecording(clip, report, path.join(directory, "runs"), 0.25, transport);
    expect(result.status).toBe("text-fallback"); expect(result.proposalPath).toBeUndefined();
    expect(JSON.parse(await readFile(result.manifestPath, "utf8")).reason).toContain("timestamps");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
