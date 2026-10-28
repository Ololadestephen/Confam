import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSalonCase } from "./salon.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
describe("salon case contract", () => {
  it("loads only development fixtures with existing curated probe requirements", async () => {
    const salon = await loadSalonCase(root, path.join(root, "specimens/salon/cases/disappearing-booking"));
    expect(salon.controls).toHaveLength(2);
    expect(salon.decoys.map(({ id }) => id)).toEqual(["t1-ui-only", "t3-wrong-owner", "t4-swallowed-error"]);
    for (const decoy of salon.decoys) {
      expect(decoy.requirements.length).toBeGreaterThan(0);
      for (const requirement of decoy.requirements) expect(Object.hasOwn(salon.probes, requirement.probe)).toBe(true);
    }
  });
  it("rejects unsupported cases before loading their contents", async () => {
    await expect(loadSalonCase(root, path.join(root, "unsupported-case"))).rejects.toThrow("Only the disappearing-booking");
  });
});
