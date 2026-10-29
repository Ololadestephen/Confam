import { expect, it } from "vitest";
import { initialDraft, prepareDraft, shellQuote } from "./draft.js";
const fields = {
  ...initialDraft,
  projectId: "different-app",
  caseId: "stateLost",
  report: "The saved state disappeared.",
  expectations:
    "A saved change remains after reopening.\nIt belongs to the same user.",
};
it("prepares a case with unexecuted scope and ordinary-verification limits", () => {
  const { definition, command } = prepareDraft(fields);
  expect(definition).toMatchObject({
    projectId: "different-app",
    mode: "verification",
    purpose: "verification",
    controls: [],
    reproductionTargets: ["E1"],
  });
  expect(definition.expectations.map((item) => item.id)).toEqual(["E1", "E2"]);
  expect(command).toContain("--workflow 'workflow.json' --accept");
  expect(command).not.toContain("--fixture");
});
it("rejects malformed expectations, identifiers, fixtures and oversized reports", () => {
  for (const change of [
    { fixtures: "[]" },
    { fixtures: "{" },
    { expectations: "" },
    { projectId: "bad id" },
    { caseId: "../case" },
    { report: "x".repeat(65537) },
  ])
    expect(() => prepareDraft({ ...fields, ...change })).toThrow();
});
it("quotes user-supplied CLI paths as data, preserving literal shell metacharacters", () => {
  expect(shellQuote("a'b")).toBe("'a'\"'\"'b'");
  const command = prepareDraft({
    ...fields,
    candidatePath: "repair $(touch bad).patch",
  }).command;
  expect(command).toContain("--candidate 'repair $(touch bad).patch'");
});

it("does not renumber blank expectation entries or silently promote a reproduction target", () => {
  expect(() => prepareDraft({ ...fields, expectations: "\nSecond" })).toThrow(
    "Expectation 1 is empty",
  );
  expect(() =>
    prepareDraft({ ...fields, expectations: "First\n\nThird" }),
  ).toThrow("Expectation 2 is empty");
});
