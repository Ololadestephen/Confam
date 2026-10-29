import { z } from "zod";
import { relativePathSchema } from "../project/config.js";

const scalar = z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()]);
const reference = z.string().min(1).max(500).refine((value) => value.split(".").every((part) =>
  /^[A-Za-z0-9_-]+$/.test(part) && !["__proto__", "prototype", "constructor"].includes(part)), "Unsafe fixture reference.");
const expected = z.union([scalar, z.strictObject({ fixture: reference })]);
const key = z.string().max(200).refine((value) => !["__proto__", "prototype", "constructor"].includes(value), "Unsafe observation pointer.");
const common = { id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/).max(100), expected };
const localRoute = z.string().min(1).max(2000).refine((value) => value.startsWith("/") && !value.startsWith("//")
  && !value.includes("\\") && !/[\u0000-\u0020]/.test(value), "Probe requires a same-project route.");
const query = z.string().min(1).max(4000).refine((value) => /^\s*SELECT\b/i.test(value) && !value.includes(";")
  && !value.includes("--") && !value.includes("/*"), "Only one reviewed SELECT statement is supported.");
export const probeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...common, kind: z.literal("json-file"), path: relativePathSchema, pointer: z.array(key).max(32) }),
  z.strictObject({ ...common, kind: z.literal("sqlite"), query, parameters: z.array(expected).max(64), column: key }),
  z.strictObject({ ...common, kind: z.literal("http-json"), path: localRoute, pointer: z.array(key).max(32) }),
]);
export const probeRegistrySchema = z.array(probeSchema).max(64).superRefine((probes, context) => {
  if (new Set(probes.map(({ id }) => id)).size !== probes.length) context.addIssue({ code: "custom", message: "Duplicate probe IDs." });
});
export type ProbeDefinition = z.infer<typeof probeSchema>;
export interface ProbeObservation { holds: boolean; observed: unknown; error?: string; }
export interface ProbeContext {
  dataDirectory: string;
  dataPath: string;
  baseUrl: string;
  fixtures: Record<string, unknown>;
  signal?: AbortSignal;
}

export function observePointer(value: unknown, pointer: string[]): unknown {
  let current = value;
  for (const part of pointer) {
    key.parse(part);
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, part)) throw new Error(`Missing observation pointer: ${pointer.join(".")}`);
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
export function resolveExpected(value: z.infer<typeof expected>, fixtures: Record<string, unknown>): string | number | boolean | null {
  if (value === null || typeof value !== "object") return value;
  reference.parse(value.fixture);
  return scalar.parse(observePointer(fixtures, value.fixture.split(".")));
}
