import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCase } from "./pipeline.js";
import { loadSalonCase } from "./salon.js";
import { evaluateVariant } from "./evaluate.js";
import { prepareBaseline } from "./variants.js";
import type { VariantResult } from "./contracts.js";
import { legacyProjectConfig } from "../project/legacy.js";
import { fileURLToPath } from "node:url";

vi.mock("./salon.js", () => ({ loadSalonCase: vi.fn() }));
vi.mock("./evaluate.js", () => ({ evaluateVariant: vi.fn() }));
vi.mock("./variants.js", () => ({ prepareBaseline: vi.fn() }));
vi.mock("./final-freeze.js", () => ({ sealFinalChecks: vi.fn().mockResolvedValue({ schemaVersion: 1, version: 1 }) }));

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
beforeEach(async () => {
  vi.resetAllMocks();
  vi.mocked(prepareBaseline).mockResolvedValue("baseline");
  vi.mocked(loadSalonCase).mockResolvedValue({
    app: "app", projectConfig: await legacyProjectConfig(), subject: { customerPhone: "1", otherCustomerPhone: "2", service: "Braids", date: "2026-10-31", slotLabel: "2:00 PM", startsAt: "2026-10-31T14:00" }, probes: {},
    controls: [{ id: "a", kind: "control", requirements: [] }, { id: "b", kind: "control", requirements: [] }],
    decoys: [{ id: "decoy", kind: "development", requirements: [], patch: fileURLToPath(new URL("../../../specimens/salon/decoys/t1-ui-only.patch", import.meta.url)) }],
  });
  vi.mocked(evaluateVariant).mockImplementation(async (spec) => ({
    ...spec, probes: {}, outcome: spec.kind === "original" ? "bug-reproduced" : "passed",
  }));
});

async function rootDirectory() {
  const root = await mkdtemp(path.join(os.tmpdir(), "confam-pipeline-"));
  directories.push(root);
  return root;
}

describe("pipeline gates and evidence", () => {
  it("runs both controls but stops before decoys and candidate when reproduction fails", async () => {
    const root = await rootDirectory();
    vi.mocked(evaluateVariant).mockImplementation(async (spec) => ({ ...spec, probes: {}, outcome: spec.kind === "original" ? "unconfirmed" : "passed" }));
    const { report, reportPath } = await runCase(root, "case", "unread-candidate.patch");
    expect(report.status).toBe("blocked");
    expect(report.variants.map(({ kind }) => kind)).toEqual(["original", "control", "control"]);
    expect(JSON.parse(await readFile(reportPath, "utf8")).status).toBe("blocked");
  });

  it("keeps uncounted decoys out of caught/survived counts and names a failing candidate", async () => {
    const root = await rootDirectory();
    const patch = path.join(root, "candidate.patch");
    await writeFile(patch, "candidate diff");
    vi.mocked(evaluateVariant).mockImplementation(async (spec) => {
      const outcome: VariantResult["outcome"] = spec.kind === "development" ? "invalid"
        : spec.kind === "candidate" ? "caught" : spec.kind === "original" ? "bug-reproduced" : "passed";
      return { ...spec, probes: {}, outcome };
    });
    const { report } = await runCase(root, "case", patch);
    expect(report.status).toBe("completed");
    expect(report.development).toEqual({ caught: 0, survived: 0, uncounted: 1, total: 1 });
    expect(report.verdict).toMatch(/^Candidate: caught\./);
    expect(report.heldOut).toEqual({ evaluated: false });
  });

  it("retains a stopped manifest when preparation throws", async () => {
    const root = await rootDirectory();
    vi.mocked(prepareBaseline).mockRejectedValue(new Error("baseline failure"));
    const { report, reportPath } = await runCase(root, "case");
    expect(report.status).toBe("error");
    expect(report.error).toBe("baseline failure");
    expect(JSON.parse(await readFile(reportPath, "utf8")).finishedAt).toBeDefined();
  });
});
