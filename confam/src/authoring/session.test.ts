import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readJson } from "../engine/json.js";
import { confirmSession, runAuthoredSession } from "./workflow.js";
import { contentHash, loadSession, newSessionDirectory, sessionDirectory, withSessionLock, writeArtifact } from "./session.js";
import { intakeSchema } from "./schemas.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "confam-session-"));
  directories.push(root);
  const { id, directory } = await newSessionDirectory(root, "fixture");
  const draft = intakeSchema.parse(await readJson(fileURLToPath(new URL("../../fixtures/day3/intake.json", import.meta.url))));
  await writeArtifact(directory, "intake.json", draft);
  await writeArtifact(directory, "session.json", {
    schemaVersion: 1, id, caseDirectory: "specimens/salon/cases/disappearing-booking", mode: "fixture", startedAt: new Date().toISOString(),
    status: "awaiting-confirmation", draftHash: contentHash(draft),
    subject: { customerPhone: "1", otherCustomerPhone: "2", service: "Braids", date: "2026-10-31", slotLabel: "2:00 PM", startsAt: "2026-10-31T14:00" },
  });
  return { root, id, directory, draft };
}

describe("explicit expectation confirmation", () => {
  it("requires an answer and includes restart survival only when accepted", async () => {
    const first = await fixture();
    await expect(confirmSession(first.root, first.id)).rejects.toThrow("--answer");
    await confirmSession(first.root, first.id, "no");
    const no = await readJson<{ expectations: { id: string; }[]; }>(path.join(first.directory, "confirmed.json"));
    expect(no.expectations.map(({ id }) => id)).not.toContain("E4");
    const second = await fixture();
    await confirmSession(second.root, second.id, "yes");
    const yes = await readJson<{ expectations: { id: string; }[]; }>(path.join(second.directory, "confirmed.json"));
    expect(yes.expectations.map(({ id }) => id)).toContain("E4");
    expect((await loadSession(second.root, second.id)).status).toBe("confirmed");
  });

  it("rejects a changed draft and changed confirmed expectations", async () => {
    const first = await fixture();
    first.draft.expectations[0]!.text = "Changed expectation";
    await writeArtifact(first.directory, "intake.json", first.draft);
    await expect(confirmSession(first.root, first.id, "yes")).rejects.toThrow("draft changed");
    const second = await fixture();
    await confirmSession(second.root, second.id, "yes");
    const file = path.join(second.directory, "confirmed.json");
    const confirmation = await readJson<{ steps: string[]; }>(file);
    confirmation.steps.push("An unapproved new step");
    await writeFile(file, JSON.stringify(confirmation));
    await expect(runAuthoredSession(second.root, second.id)).rejects.toThrow("Confirmed expectations changed");
  });

  it("keeps sessions inside runs and rejects concurrent mutation", async () => {
    const session = await fixture();
    expect(() => sessionDirectory(session.root, "../../outside")).toThrow("Invalid");
    await withSessionLock(session.directory, async () => {
      await expect(confirmSession(session.root, session.id, "yes")).rejects.toThrow("locked");
    });
    await expect(confirmSession(session.root, session.id, "yes")).resolves.toMatchObject({ status: "confirmed" });
  });
});
