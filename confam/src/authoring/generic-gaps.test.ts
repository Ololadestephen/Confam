import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { proposeGaps } from "./generic-gaps.js";
import type { ModelTransport } from "../models/client.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-gaps-")); directories.push(directory);
  const app = path.join(directory, "app"); await mkdir(app);
  await writeFile(path.join(app, "main.js"), "limit by first forwarded address\n");
  await writeFile(path.join(directory, "project.json"), JSON.stringify({
    schemaVersion: 1, id: "sample", root: "app", sourceFiles: ["main.js"], runtime: {
      command: ["node", "main.js"], readinessPath: "/ready", portVariable: "PORT", dataVariable: "STATE", restart: false,
    }
  }));
  await writeFile(path.join(directory, "case.json"), JSON.stringify({
    schemaVersion: 1, id: "example", projectId: "sample", report: "report.md", fixtures: {},
    expectations: [{ id: "limited", statement: "A sixth request is refused", provenance: "developer" }], reproductionTargets: ["limited"],
    mode: "verification", controls: [],
  }));
  await writeFile(path.join(directory, "report.md"), "Spam gets through.");
  return directory;
}
function transport(inspect: () => void = () => undefined): ModelTransport {
  return {
    mode: "fixture", count: async () => 100, generate: async () => {
      inspect();
      return { completed: true, usage: { input: 100, output: 100, cached: 0 }, text: JSON.stringify({ gaps: [
        { id: "limited", statement: "Duplicate of a confirmed expectation", why: "x", scenario: "x" },
        { id: "headerBypass", statement: "Changing a request header does not reset the limit", why: "Spammers control headers", scenario: "Send a new address each time" },
      ] }) };
    },
  };
}
const run = (directory: string, preview: boolean, injected: ModelTransport) =>
  proposeGaps(path.join(directory, "project.json"), path.join(directory, "case.json"), path.join(directory, "runs"), { budget: 0.25, preview, transport: injected });

it("previews the exact gap-finding export without calling a model", async () => {
  const directory = await fixture();
  let called = false;
  const draft = await run(directory, true, transport(() => { called = true; }));
  expect(called).toBe(false);
  expect(draft.proposalPath).toBeUndefined();
  const exported = JSON.parse(await readFile(draft.exportPath, "utf8"));
  expect(Object.keys(exported.input)).toEqual(["report", "confirmedExpectations", "sources"]);
  expect(await readdir(draft.directory)).not.toContain("model-usage.json");
});

it("records proposed expectations for review and drops ones already confirmed", async () => {
  const directory = await fixture();
  const draft = await run(directory, false, transport());
  const proposal = JSON.parse(await readFile(draft.proposalPath!, "utf8"));
  expect(proposal.status).toBe("needs-review");
  expect(proposal.gaps.map(({ id }: { id: string }) => id)).toEqual(["headerBypass"]);
});
