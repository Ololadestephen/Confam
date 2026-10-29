import { describe, expect, it } from "vitest";
import { resolveReference, validateWorkflow, workflowSchema } from "./schema.js";

const expectations = [{ id: "total", statement: "The total updates" }];
const plan = {
  schemaVersion: 1, steps: [
    { action: "navigate", path: "/" },
    { action: "capture", locator: { kind: "testId", value: "total" }, kind: "number", capture: "sum" },
    { action: "reached" },
    { action: "assert", expectationId: "total", actual: { variable: "sum" }, operator: "eq", expected: 20 },
  ]
};
describe("workflow contract boundaries", () => {
  it("validates arbitrary IDs and a typed observation plan", () => {
    expect(validateWorkflow(plan, expectations, {}, { restart: false }).steps).toHaveLength(4);
  });
  it.each(["https://external.example/", "//external.example/", "/\\external.example", "/\nunsafe"])("refuses external or ambiguous path %s", (target) => {
    expect(workflowSchema.safeParse({ ...plan, steps: [{ action: "navigate", path: target }] }).success).toBe(false);
  });
  it("rejects arbitrary code, unknown assertion IDs and missing coverage", () => {
    expect(workflowSchema.safeParse({ schemaVersion: 1, steps: [{ action: "evaluate", script: "process.exit()" }] }).success).toBe(false);
    expect(() => validateWorkflow(plan, [{ id: "different", statement: "Different" }], {}, { restart: false })).toThrow("Unknown expectation");
    expect(() => validateWorkflow(plan, [...expectations, { id: "missing", statement: "Missing" }], {}, { restart: false })).toThrow("every confirmed");
  });
  it("refuses unbound variables, absent fixtures and unsupported restart", () => {
    const assertion = plan.steps.at(-1);
    expect(() => validateWorkflow({ schemaVersion: 1, steps: [{ action: "reached" }, assertion] }, expectations, {}, { restart: false })).toThrow("captured");
    expect(() => validateWorkflow({ ...plan, steps: [{ action: "fill", locator: { kind: "label", value: "Quantity" }, value: { fixture: "quantity" } }, ...plan.steps] }, expectations, {}, { restart: false })).toThrow("Unknown value");
    expect(() => validateWorkflow({ ...plan, steps: [{ action: "restart" }, ...plan.steps] }, expectations, {}, { restart: false })).toThrow("restart");
  });
  it("rejects inherited and prototype-path references", () => {
    expect(() => resolveReference(Object.create({ quantity: 1 }), "quantity")).toThrow("Unknown value");
    expect(() => resolveReference({}, "constructor.prototype")).toThrow();
  });
  it("does not allow a model to provide observed values directly", () => {
    expect(workflowSchema.safeParse({ schemaVersion: 1, steps: [{ action: "assert", expectationId: "total", actual: 20, expected: 20, operator: "eq" }] }).success).toBe(false);
  });
});

it("permits approved fixture expectations but refuses app-derived expected values", () => {
  const withFixture = {
    ...plan, steps: [...plan.steps.slice(0, -1), {
      action: "assert", expectationId: "total", actual: { variable: "sum" }, operator: "gte", expected: { fixture: "quote.total" },
    }]
  };
  expect(validateWorkflow(withFixture, expectations, { quote: { total: 20 } }, { restart: false }).steps).toHaveLength(4);
  expect(() => validateWorkflow(withFixture, expectations, { quote: { total: "20" } }, { restart: false })).toThrow("numeric expected");
  expect(workflowSchema.safeParse({
    ...plan, steps: [...plan.steps.slice(0, -1), {
      action: "assert", expectationId: "total", actual: { variable: "sum" }, operator: "eq", expected: { variable: "sum" },
    }]
  }).success).toBe(false);
});
