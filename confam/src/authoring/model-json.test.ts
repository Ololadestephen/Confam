import { expect, it } from "vitest";
import { z } from "zod";
import { modelFixturesSchema, modelJsonSchema } from "./model-json.js";
import { requirementsWireSchema } from "./onboarding.js";

it("emits nonrecursive model schemas and accepts bounded generic fixtures", () => {
  for (const schema of [modelJsonSchema, requirementsWireSchema]) {
    const json = JSON.stringify(z.toJSONSchema(schema));
    expect(json).not.toContain('"$ref"');
  }
  expect(
    modelFixturesSchema.safeParse({
      user: { name: "Example", tags: ["one", "two"] },
      total: 3,
    }).success,
  ).toBe(true);
  expect(modelJsonSchema.safeParse({ a: { b: { c: { d: 1 } } } }).success).toBe(
    false,
  );
});

it("emits closed provider objects with all properties required", async () => {
  const { modelWorkflowSchema } = await import("./model-workflow.js");
  function check(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(check);
      return;
    }
    const object = value as Record<string, unknown>;
    expect(object).not.toHaveProperty("$ref");
    expect(object).not.toHaveProperty("propertyNames");
    expect(object).not.toHaveProperty("oneOf");
    if (object.type === "object") {
      expect(object.additionalProperties).toBe(false);
      expect(new Set((object.required as string[]) ?? [])).toEqual(
        new Set(Object.keys((object.properties as object) ?? {})),
      );
    }
    Object.values(object).forEach(check);
  }
  check(z.toJSONSchema(requirementsWireSchema));
  check(z.toJSONSchema(modelWorkflowSchema));
});
