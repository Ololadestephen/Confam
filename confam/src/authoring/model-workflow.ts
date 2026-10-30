import { z } from "zod";
import {
  locatorSchema,
  workflowSchema,
  type WorkflowPlan,
} from "../workflows/schema.js";
import { modelJsonSchema } from "./model-json.js";

const locatorOptions = locatorSchema.options.map((option) =>
  option.shape.kind.value === "role"
    ? option.extend({ name: z.string().max(1000).nullable() })
    : option,
);
const wireLocator = z.union(
  locatorOptions as unknown as typeof locatorSchema.options,
);
const options = workflowSchema.shape.steps.element.options;
const modelOptions = options.map((option) => {
  const action = option.shape.action.value;
  if (action === "request")
    return (option as (typeof options)[9])
      .omit({ body: true, headers: true })
      .extend({ bodyJson: z.string().max(10000).nullable(), headersJson: z.string().max(10000).nullable() });
  if (action === "select")
    return option.extend({
      locator: wireLocator,
      by: z.enum(["label", "value"]).nullable(),
    });
  if (
    action === "fill" ||
    action === "click" ||
    action === "wait" ||
    action === "capture"
  )
    return option.extend({ locator: wireLocator });
  return option;
});
// The tuple preserves the same discriminants while wire-only fields differ.
export const modelWorkflowSchema = workflowSchema.extend({
  steps: z
    .array(z.union(modelOptions as unknown as typeof options))
    .min(1)
    .max(200),
});

export function decodeModelWorkflow(input: unknown): WorkflowPlan {
  const wire = modelWorkflowSchema.parse(input);
  const steps = wire.steps.map((step) => {
    const value = { ...step } as Record<string, unknown>;
    if (value.action === "request") {
      const bodyJson = value.bodyJson;
      delete value.bodyJson;
      if (bodyJson !== null) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(bodyJson as string);
        } catch {
          throw new Error("Invalid workflow request body JSON.");
        }
        value.body = modelJsonSchema.parse(parsed);
      }
      const headersJson = value.headersJson;
      delete value.headersJson;
      if (headersJson !== null) {
        try {
          value.headers = JSON.parse(headersJson as string);
        } catch {
          throw new Error("Invalid workflow request headers JSON.");
        }
      }
    }
    if (value.by === null) delete value.by;
    if (value.locator && typeof value.locator === "object") {
      const locator = { ...(value.locator as Record<string, unknown>) };
      if (locator.name === null) delete locator.name;
      value.locator = locator;
    }
    return value;
  });
  return workflowSchema.parse({ ...wire, steps });
}
