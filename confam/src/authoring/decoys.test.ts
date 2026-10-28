import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readJson } from "../engine/json.js";
import { prepareBaseline } from "../engine/variants.js";
import { materializeDecoys, sourceBundle } from "./decoys.js";
import { decoyDraftSchema } from "./schemas.js";

const directories: string[] = [];
const specimen = fileURLToPath(new URL("../../../specimens/salon/", import.meta.url));
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-decoys-"));
  directories.push(directory);
  const baseline = await prepareBaseline(path.join(specimen, "app"), directory);
  const draft = decoyDraftSchema.parse(await readJson(fileURLToPath(new URL("../../fixtures/day3/decoys.json", import.meta.url))));
  return { directory, baseline, draft, trusted: path.join(specimen, "decoys/t4-swallowed-error.patch") };
}

describe("generated edit compilation", () => {
  it("preserves the baseline and distinguishes generated edits from the curated failed insert", async () => {
    const { directory, baseline, draft, trusted } = await fixture();
    const before = await readFile(path.join(baseline, "server.js"), "utf8");
    const specs = await materializeDecoys(baseline, directory, draft, trusted);
    expect(specs).toHaveLength(3);
    expect(specs.find(({ id }) => id === "generated-t4")?.patchSource).toBe("curated-mutation");
    expect(specs.find(({ id }) => id === "generated-t1")?.patchSource).toBe("model-edits");
    const t4 = await readFile(path.join(directory, "generation/generated-t4/server.js"), "utf8");
    expect(t4).toContain("db.addAppointment({ ...appointment, serviceId: -1 });");
    expect(await readFile(path.join(baseline, "server.js"), "utf8")).toBe(before);
    expect(Object.keys(await sourceBundle(baseline))).toEqual(["server.js", "db.js", "public/app.js", "public/index.html", "public/styles.css"]);
  });

  it.each(["absent replacement text", "const"])("rejects an absent or ambiguous edit: %s", async (before) => {
    const { directory, baseline, draft, trusted } = await fixture();
    draft.decoys[0]!.edits[0]!.before = before;
    await expect(materializeDecoys(baseline, directory, draft, trusted)).rejects.toThrow("absent or ambiguous");
  });
});
