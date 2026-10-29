import { expect, it } from "vitest";
import { z } from "zod";
import { decodeModelWorkflow, modelWorkflowSchema } from "./model-workflow.js";
import { workflowSchema } from "../workflows/schema.js";

it("retains every supported workflow action without recursive JSON references", () => {
  expect(JSON.stringify(z.toJSONSchema(modelWorkflowSchema))).not.toContain(
    '"$ref"',
  );
  const locator = { kind: "testId", value: "item" };
  const steps = [
    { action: "navigate", path: "/" },
    { action: "fill", locator, value: "x" },
    { action: "click", locator },
    { action: "select", locator, value: "x", by: null },
    { action: "wait", locator },
    { action: "reload" },
    { action: "reopen" },
    { action: "context", name: "other" },
    { action: "restart" },
    {
      action: "request",
      path: "/api",
      method: "POST",
      bodyJson: JSON.stringify({ item: { name: "example" } }),
      capture: "response",
    },
    { action: "capture", locator, kind: "text", capture: "text" },
    { action: "reached" },
    {
      action: "assert",
      expectationId: "E1",
      actual: { variable: "text" },
      operator: "eq",
      expected: "x",
    },
  ];
  expect(
    modelWorkflowSchema.safeParse({ schemaVersion: 1, steps }).success,
  ).toBe(true);
  expect(
    workflowSchema.safeParse(decodeModelWorkflow({ schemaVersion: 1, steps }))
      .success,
  ).toBe(true);

  expect(
    modelWorkflowSchema.safeParse({
      schemaVersion: 1,
      steps: [{ ...steps[9], bodyJson: "x".repeat(10001) }],
    }).success,
  ).toBe(false);
});
