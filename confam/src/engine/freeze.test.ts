import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { freezeChecks, verifyChecks } from "./freeze.js";
import type { BookingSubject } from "./contracts.js";

const directories: string[] = [];
const subject: BookingSubject = { customerPhone: "1", otherCustomerPhone: "2", service: "Braids", date: "2026-10-31", slotLabel: "2:00 PM", startsAt: "2026-10-31T14:00" };

afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-freeze-"));
  directories.push(directory);
  const source = path.join(directory, "source.ts");
  await writeFile(source, "export const checks = true;\n");
  return { directory, checks: await freezeChecks(path.join(directory, "v1"), source, subject) };
}

describe("frozen checks", () => {
  it("includes compiled model declarations in the frozen hash", async () => {
    const { directory } = await fixture();
    const checks = await freezeChecks(path.join(directory, "planned"), path.join(directory, "source.ts"), subject, [
      { expectationId: "E1", observation: "after-reopen", expectedCount: 1, message: "The booking remains." },
    ]);
    await verifyChecks(checks);
    await writeFile(path.join(checks.directory, "plan.json"), "[]");
    await expect(verifyChecks(checks)).rejects.toThrow("hash mismatch");
  });
  it("accepts unchanged checks and rejects a changed subject", async () => {
    const { checks } = await fixture();
    await expect(verifyChecks(checks)).resolves.toBeUndefined();
    await writeFile(path.join(checks.directory, "subject.json"), "{}");
    await expect(verifyChecks(checks)).rejects.toThrow("hash mismatch");
  });

  it("rejects changed checks, added files, and symlinks", async () => {
    const { checks } = await fixture();
    await writeFile(path.join(checks.directory, "checks.ts"), "export const checks = false;");
    await expect(verifyChecks(checks)).rejects.toThrow("hash mismatch");
    const added = await fixture();
    await writeFile(path.join(added.checks.directory, "extra.ts"), "");
    await expect(verifyChecks(added.checks)).rejects.toThrow("hash mismatch");
    const linked = await fixture();
    await symlink(path.join(linked.directory, "source.ts"), path.join(linked.checks.directory, "link.ts"));
    await expect(verifyChecks(linked.checks)).rejects.toThrow("non-regular file");
  });
});
