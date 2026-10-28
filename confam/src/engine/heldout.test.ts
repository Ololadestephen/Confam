import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readEvaluationPack } from "./heldout.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-evaluation-contract-"));
  directories.push(directory);
  const pack = {
    schemaVersion: 1, purpose: "integration-fixture", label: "Synthetic pack contract test, not held-out evidence",
    decoys: [{ id: "synthetic", patch: "synthetic.patch", violation: "Synthetic missing-row observation", requirements: [{ probe: "appointment-saved", holds: false }] }],
  };
  const file = path.join(directory, "pack.json");
  await writeFile(path.join(directory, "synthetic.patch"), "synthetic patch bytes");
  await writeFile(file, JSON.stringify(pack));
  return { directory, file, pack };
}

describe("separate post-freeze evaluation pack", () => {
  it("does not treat correct behavior or a missing row as a confirmed wrong-owner decoy", async () => {
    const { file, pack } = await fixture();
    pack.decoys[0]!.requirements[0]!.holds = true;
    await writeFile(file, JSON.stringify(pack));
    await expect(readEvaluationPack(file)).rejects.toThrow("independently observed violation");
    pack.decoys[0]!.requirements = [{ probe: "appointment-owned-by-customer", holds: false }];
    await writeFile(file, JSON.stringify(pack));
    await expect(readEvaluationPack(file)).rejects.toThrow("saved row");
  });
  it("hashes the complete pack and patch bytes and marks its set separately", async () => {
    const { directory, file } = await fixture();
    const before = await readEvaluationPack(file);
    expect(before.patches[0]?.spec.kind).toBe("held-out");
    expect(before.pack.purpose).toBe("integration-fixture");
    await writeFile(path.join(directory, "synthetic.patch"), "different bytes");
    expect((await readEvaluationPack(file)).sha256).not.toBe(before.sha256);
  });

  it("rejects traversal, symlink patches and invented probes", async () => {
    const { directory, file, pack } = await fixture();
    pack.decoys[0]!.patch = "../outside.patch";
    await writeFile(file, JSON.stringify(pack));
    await expect(readEvaluationPack(file)).rejects.toThrow("escapes");
    pack.decoys[0]!.patch = "link.patch";
    await symlink(path.join(directory, "synthetic.patch"), path.join(directory, "link.patch"));
    await writeFile(file, JSON.stringify(pack));
    await expect(readEvaluationPack(file)).rejects.toThrow("regular file");
    pack.decoys[0]!.patch = "synthetic.patch";
    pack.decoys[0]!.requirements[0]!.probe = "invented";
    await writeFile(file, JSON.stringify(pack));
    await expect(readEvaluationPack(file)).rejects.toThrow();
  });
});
