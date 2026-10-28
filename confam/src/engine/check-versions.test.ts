import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CheckDeclaration } from "./contracts.js";
import { evaluateCheckVersions, type VersionOptions } from "./check-versions.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const assertions: CheckDeclaration[] = [
  { expectationId: "E2", observation: "other-customer", expectedCount: 0, message: "Only the booking customer sees it." },
  { expectationId: "E1", observation: "after-reopen", expectedCount: 1, message: "The booking remains after reopening." },
];
const extra = (round: number): CheckDeclaration => round === 1
  ? { expectationId: "E1", observation: "fresh-sign-in", expectedCount: 1, message: "The booking remains after signing in again." }
  : { expectationId: "E2", observation: "other-customer-reopen", expectedCount: 0, message: "The other customer still cannot see it after reopening." };

async function fixture(): Promise<VersionOptions> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-versions-"));
  directories.push(directory);
  const source = path.join(directory, "workflow.ts");
  const patch = path.join(directory, "synthetic.patch");
  await writeFile(source, "export async function runChecks() {}\n");
  await writeFile(patch, "A synthetic patch used by a scripted unit evaluator, not behavioral evidence.\n");
  return {
    directory, source, assertions: structuredClone(assertions),
    subject: { customerPhone: "1", otherCustomerPhone: "2", service: "Braids", date: "2026-10-31", slotLabel: "2:00 PM", startsAt: "2026-10-31T14:00" },
    controls: [{ id: "a", kind: "control", requirements: [] }, { id: "b", kind: "control", requirements: [] }],
    decoys: vi.fn().mockResolvedValue([{ id: "development-survivor", kind: "development", patch, violation: "Synthetic unit-test violation", requirements: [] }]),
    evaluate: vi.fn(async (spec) => ({ ...spec, probes: {}, outcome: spec.kind === "original" ? "bug-reproduced" : spec.kind === "control" ? "passed" : "survived" })),
    changed: vi.fn(),
  };
}

describe("bounded versioned strengthening", () => {
  it("performs zero rounds when every development decoy is caught", async () => {
    const options = await fixture();
    options.evaluate = vi.fn(async (spec) => ({ ...spec, probes: {}, outcome: spec.kind === "original" ? "bug-reproduced" : spec.kind === "control" ? "passed" : "caught" }));
    options.strengthen = vi.fn();
    const result = await evaluateCheckVersions(options);
    expect(result.rounds).toBe(0);
    expect(result.versions).toHaveLength(1);
    expect(options.strengthen).not.toHaveBeenCalled();
  });

  it("stops after two rounds, preserves three versions, and rechecks both controls each time", async () => {
    const options = await fixture();
    options.strengthen = vi.fn(async (request) => ({ assertions: [...request.assertions, extra(request.round)], reason: "A synthetic extra observation", reviewReasons: [] }));
    const result = await evaluateCheckVersions(options);
    expect(result.status).toBe("ready");
    expect(result.reason).toBe("round-limit");
    expect(result.rounds).toBe(2);
    expect(result.versions).toHaveLength(3);
    expect(new Set(result.versions.map(({ checks }) => checks.sha256)).size).toBe(3);
    for (const record of result.versions) {
      expect(record.results.filter(({ kind }) => kind === "control")).toHaveLength(2);
      expect(record.gatePassed).toBe(true);
      expect(await readFile(path.join(options.directory, "checks", `v${record.version}-results.json`), "utf8")).toContain("development-survivor");
    }
    expect(options.decoys).toHaveBeenCalledTimes(1);
    expect(options.strengthen).toHaveBeenCalledTimes(2);
    const request = vi.mocked(options.strengthen).mock.calls[0]?.[0];
    expect(request?.survivors.map(({ id }) => id)).toEqual(["development-survivor"]);
  });

  it("blocks a strengthening version that falsely rejects a correct control", async () => {
    const options = await fixture();
    options.strengthen = vi.fn(async (request) => ({ assertions: [...request.assertions, extra(1)], reason: "Extra observation", reviewReasons: [] }));
    options.evaluate = vi.fn(async (spec, _checks, version) => ({ ...spec, probes: {}, outcome: spec.kind === "original" ? "bug-reproduced" : spec.kind === "control" ? version === 2 && spec.id === "b" ? "falsely-rejected" : "passed" : "survived" }));
    const result = await evaluateCheckVersions(options);
    expect(result.status).toBe("blocked");
    expect(result.versions).toHaveLength(2);
    expect(result.versions[1]?.gatePassed).toBe(false);
  });

  it("keeps a changed expectation pending review without creating another frozen version", async () => {
    const options = await fixture();
    options.strengthen = vi.fn(async () => ({ assertions: [{ ...assertions[0]!, expectedCount: 1 }, assertions[1]!], reason: "Changed ownership expectation", reviewReasons: [] }));
    const result = await evaluateCheckVersions(options);
    expect(result.status).toBe("needs-review");
    expect(result.versions).toHaveLength(1);
    if (result.status !== "needs-review") throw new Error("Expected review state");
    expect(result.reviewReasons.join(" ")).toContain("altered or removed");
    expect(await readFile(result.proposalPath, "utf8")).toContain("Changed ownership");
  });

  it("cannot mutate history through the verifier's input array", async () => {
    const options = await fixture();
    options.strengthen = vi.fn(async (request) => {
      request.assertions[0]!.expectedCount = 1;
      return { assertions: request.assertions, reason: "Attempted in-place change", reviewReasons: [] };
    });
    const result = await evaluateCheckVersions(options);
    expect(result.status).toBe("needs-review");
    expect(result.versions[0]?.assertions?.[0]?.expectedCount).toBe(0);
    expect(options.assertions?.[0]?.expectedCount).toBe(0);
  });
});
