import { expect, it } from "vitest";
import { caseDefinitionSchema } from "./case.js";

const definition = {
  schemaVersion: 1, id: "quantity", projectId: "quote-tool", report: "report.txt",
  fixtures: { quantity: 3, item: { price: 10 } },
  expectations: [{ id: "totalUpdates", statement: "The total reflects the chosen quantity", provenance: "developer" }],
  reproductionTargets: ["totalUpdates"], mode: "verification",
};
it("accepts non-booking expectations and verification without controls", () => {
  expect(caseDefinitionSchema.parse(definition).controls).toEqual([]);
});
it("does not permit a benchmark without both controls", () => {
  expect(caseDefinitionSchema.safeParse({ ...definition, mode: "benchmark" }).success).toBe(false);
});
it("rejects unknown reproduction references and duplicate expectations", () => {
  expect(caseDefinitionSchema.safeParse({ ...definition, reproductionTargets: ["unknown"] }).success).toBe(false);
  expect(caseDefinitionSchema.safeParse({ ...definition, expectations: [...definition.expectations, ...definition.expectations] }).success).toBe(false);
});
it("rejects duplicate or reserved control identities", () => {
  const controls = [{ id: "original", patch: "a.patch" }, { id: "original", patch: "b.patch" }];
  expect(caseDefinitionSchema.safeParse({ ...definition, mode: "benchmark", controls }).success).toBe(false);
});

it("rejects controls referencing the same patch", () => {
  const controls = [{ id: "first", patch: "same.patch" }, { id: "second", patch: "same.patch" }];
  expect(caseDefinitionSchema.safeParse({ ...definition, mode: "benchmark", controls }).success).toBe(false);
});
