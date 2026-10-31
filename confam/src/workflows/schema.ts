import { z } from "zod";

const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/).max(100);
const reference = z.string().min(1).max(500).refine((value) =>
  value.split(".").every((part) => /^[A-Za-z0-9_-]+$/.test(part)
    && !["__proto__", "prototype", "constructor"].includes(part)), "Unsafe value reference.");
const scalar = z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()]);
export const valueSchema = z.union([scalar, z.strictObject({ fixture: reference }), z.strictObject({ variable: reference })]);
const actualSchema = z.strictObject({ variable: reference });
const expectedSchema = z.union([scalar, z.strictObject({ fixture: reference })]);
const localPath = z.string().min(1).max(2000).refine((value) => value.startsWith("/") && !value.startsWith("//")
  && !value.includes("\\") && !/[\u0000-\u0020]/.test(value), "Only same-project absolute paths are supported.");
// Headers a workflow may set on a request. Transport and routing headers stay under the runner's control.
const reservedHeaders = new Set(["host", "content-length", "connection", "transfer-encoding", "cookie"]);
const headerName = z.string().regex(/^[A-Za-z0-9-]{1,100}$/).refine((name) => !reservedHeaders.has(name.toLowerCase()), "Reserved request header.");
const headersSchema = z.record(headerName, valueSchema).refine((headers) => Object.keys(headers).length <= 20, "At most 20 request headers.");
const role = z.enum(["button", "link", "textbox", "checkbox", "radio", "combobox", "option", "heading", "status", "list", "listitem", "table", "row", "cell", "dialog", "tab", "alert"]);
export const locatorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("role"), value: role, name: z.string().max(1000).optional() }),
  z.strictObject({ kind: z.literal("label"), value: z.string().min(1).max(1000) }),
  z.strictObject({ kind: z.literal("testId"), value: z.string().min(1).max(1000) }),
  z.strictObject({ kind: z.literal("css"), value: z.string().min(1).max(2000) }),
]);
const locator = { locator: locatorSchema };
const requestFields = { path: localPath, method: z.enum(["GET", "POST"]), headers: headersSchema.optional(), body: z.json().optional(), capture: identifier };
const parallelRequest = z.strictObject(requestFields);
export const workflowSchema = z.strictObject({
  schemaVersion: z.literal(1),
  steps: z.array(z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("navigate"), path: localPath }),
    z.strictObject({ action: z.literal("fill"), ...locator, value: valueSchema }),
    z.strictObject({ action: z.literal("click"), ...locator }),
    z.strictObject({ action: z.literal("select"), ...locator, value: valueSchema, by: z.enum(["label", "value"]).optional() }),
    z.strictObject({ action: z.literal("wait"), ...locator }),
    z.strictObject({ action: z.literal("reload") }),
    z.strictObject({ action: z.literal("reopen") }),
    z.strictObject({ action: z.literal("context"), name: identifier }),
    z.strictObject({ action: z.literal("restart") }),
    z.strictObject({ action: z.literal("request"), ...requestFields }),
    z.strictObject({ action: z.literal("parallel"), requests: z.array(parallelRequest).min(2).max(20) }),
    z.strictObject({ action: z.literal("capture"), ...locator, kind: z.enum(["text", "count", "visible", "number"]), capture: identifier }),
    z.strictObject({ action: z.literal("reached") }),
    z.strictObject({ action: z.literal("assert"), expectationId: identifier, actual: actualSchema, operator: z.enum(["eq", "gte", "lte"]), expected: expectedSchema }),
  ])).min(1).max(200),
});
export type WorkflowPlan = z.infer<typeof workflowSchema>;
export type WorkflowStep = WorkflowPlan["steps"][number];
export type WorkflowLocator = z.infer<typeof locatorSchema>;
export type WorkflowValue = z.infer<typeof valueSchema>;

export function resolveReference(source: Record<string, unknown>, referencePath: string): unknown {
  reference.parse(referencePath);
  let result: unknown = source;
  for (const key of referencePath.split(".")) {
    if (typeof result !== "object" || result === null || !Object.hasOwn(result, key)) throw new Error(`Unknown value reference: ${referencePath}`);
    result = (result as Record<string, unknown>)[key];
  }
  return result;
}

export function resolveValue(value: WorkflowValue, fixtures: Record<string, unknown>, variables: Record<string, unknown>): unknown {
  if (typeof value !== "object" || value === null) return value;
  return "fixture" in value ? resolveReference(fixtures, value.fixture) : resolveReference(variables, value.variable);
}

export function resolveBody(value: unknown, fixtures: Record<string, unknown>, variables: Record<string, unknown>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => resolveBody(item, fixtures, variables));
  const entries = Object.entries(value);
  if (entries.length === 1 && (Object.hasOwn(value, "fixture") || Object.hasOwn(value, "variable"))) {
    return resolveValue(valueSchema.parse(value), fixtures, variables);
  }
  return Object.fromEntries(entries.map(([key, item]) => [key, resolveBody(item, fixtures, variables)]));
}

function validateReferenceValue(value: unknown, fixtures: Record<string, unknown>, captured: Set<string>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { for (const item of value) validateReferenceValue(item, fixtures, captured); return; }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 1 && typeof record.fixture === "string") {
    resolveReference(fixtures, record.fixture);
  } else if (Object.keys(record).length === 1 && typeof record.variable === "string") {
    reference.parse(record.variable);
    if (!captured.has(record.variable.split(".")[0]!)) throw new Error(`Variable has not been captured: ${record.variable}`);
  } else for (const item of Object.values(record)) validateReferenceValue(item, fixtures, captured);
}

export function validateWorkflow(
  input: unknown, expectations: { id: string; statement: string; }[], fixtures: Record<string, unknown>, capabilities: { restart: boolean; },
): WorkflowPlan {
  const plan = workflowSchema.parse(input);
  const expected = new Set(expectations.map(({ id }) => id));
  if (expected.size !== expectations.length || expected.size === 0) throw new Error("Expectations must have distinct IDs.");
  const asserted = new Set<string>();
  const captured = new Set<string>();
  let reached = false;
  for (const step of plan.steps) {
    validateReferenceValue(step, fixtures, captured);
    if (step.action === "restart" && !capabilities.restart) throw new Error("Project does not support restart.");
    if (step.action === "reached") reached = true;
    if (step.action === "assert") {
      if (!reached) throw new Error("Assertions must follow the declared workflow reach point.");
      if (!expected.has(step.expectationId)) throw new Error(`Unknown expectation: ${step.expectationId}`);
      const expectedValue = resolveValue(step.expected, fixtures, {});
      if (step.operator !== "eq" && (typeof expectedValue !== "number" || !Number.isFinite(expectedValue))) throw new Error("Numeric comparison requires a numeric expected value.");
      asserted.add(step.expectationId);
    }
    if (step.action === "capture" || step.action === "request") {
      if (captured.has(step.capture)) throw new Error(`Duplicate capture name: ${step.capture}`);
      captured.add(step.capture);
    }
    const requests = step.action === "parallel" ? step.requests : step.action === "request" ? [step] : [];
    for (const request of requests) {
      if (request.method === "GET" && request.body !== undefined) throw new Error("GET request bodies are unsupported.");
      if (step.action === "parallel") {
        if (captured.has(request.capture)) throw new Error(`Duplicate capture name: ${request.capture}`);
        captured.add(request.capture);
      }
    }
  }
  if (!reached || expected.size !== asserted.size) throw new Error("Workflow must reach and assert every confirmed expectation.");
  return plan;
}
