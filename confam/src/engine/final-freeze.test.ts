import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { prepareBaseline } from "./variants.js";
import { freezeChecks } from "./freeze.js";
import { loadFinalRun, sealFinalChecks } from "./final-freeze.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-final-seal-"));
  directories.push(directory);
  const app = fileURLToPath(new URL("../../../specimens/salon/app/", import.meta.url));
  const baseline = await prepareBaseline(app, directory);
  const source = path.join(directory, "source.ts");
  await writeFile(source, "export async function runChecks() {}\n");
  const subject = { customerPhone: "1", otherCustomerPhone: "2", service: "Braids", date: "2026-10-31", slotLabel: "2:00 PM", startsAt: "2026-10-31T14:00" };
  const checks = await freezeChecks(path.join(directory, "checks/v1"), source, subject);
  const seal = await sealFinalChecks(directory, 1, checks, baseline);
  const report = { status: "completed", finalFreeze: seal };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(report));
  return { directory, baseline, checks, report };
}

describe("final checks seal", () => {
  it("loads the same seal regardless of object property order and refuses overwriting it", async () => {
    const { directory, baseline, checks } = await fixture();
    expect((await loadFinalRun(directory)).seal.checks.sha256).toBe(checks.sha256);
    await expect(sealFinalChecks(directory, 1, checks, baseline)).rejects.toThrow();
    await expect(freezeChecks(checks.directory, path.join(directory, "source.ts"), (await loadFinalRun(directory)).subject)).rejects.toThrow();
  });

  it("rejects a changed workflow, baseline, or pending review manifest", async () => {
    const first = await fixture();
    await writeFile(path.join(first.checks.directory, "checks.ts"), "changed");
    await expect(loadFinalRun(first.directory)).rejects.toThrow("hash mismatch");
    const second = await fixture();
    const file = path.join(second.baseline, "server.js");
    await writeFile(file, (await readFile(file, "utf8")) + "\n// changed\n");
    await expect(loadFinalRun(second.directory)).rejects.toThrow("baseline changed");
    const third = await fixture();
    await writeFile(path.join(third.directory, "manifest.json"), JSON.stringify({ ...third.report, status: "needs-review" }));
    await expect(loadFinalRun(third.directory)).rejects.toThrow("completed final freeze");
  });
});
