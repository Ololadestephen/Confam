import { z } from "zod";

// Explicitly expand the tree so the model provider receives no recursive schema.
const scalar = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const level1 = z.union([
  scalar,
  z.array(scalar).max(100),
  z.record(z.string().max(500), scalar),
]);
const level2 = z.union([
  scalar,
  z.array(level1).max(100),
  z.record(z.string().max(500), level1),
]);
export const modelJsonSchema = z.union([
  scalar,
  z.array(level2).max(100),
  z.record(z.string().max(500), level2),
]);
export const modelFixturesSchema = z.record(
  z.string().max(500),
  modelJsonSchema,
);
