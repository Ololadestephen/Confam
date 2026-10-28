import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readJson } from "../engine/json.js";
import { expectationSchema } from "./schemas.js";

const subjectSchema = z.strictObject({ customerPhone: z.string(), otherCustomerPhone: z.string(), service: z.string(), date: z.string(), slotLabel: z.string(), startsAt: z.string() });
export const sessionSchema = z.strictObject({
  schemaVersion: z.literal(1), id: z.string(), caseDirectory: z.string(),
  mode: z.enum(["live", "fixture"]), startedAt: z.string(), finishedAt: z.string().optional(),
  status: z.enum(["drafting", "awaiting-confirmation", "confirmed", "running", "completed", "blocked", "needs-review", "budget-stopped", "error"]),
  subject: subjectSchema, draftHash: z.string().optional(), confirmedHash: z.string().optional(),
  error: z.string().optional(), reportPath: z.string().optional(),
  parentId: z.string().optional(),
});
export type AuthoringSession = z.infer<typeof sessionSchema>;
export const confirmationSchema = z.strictObject({
  expectations: z.array(expectationSchema).min(2).max(4), steps: z.array(z.string()),
  answer: z.enum(["yes", "no"]).nullable(), confirmedAt: z.string(), source: z.enum(["developer-cli", "fixture"]),
});

export function contentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function sessionDirectory(root: string, id: string): string {
  if (!/^(?:model|demo)-[A-Za-z0-9-]+$/.test(id)) throw new Error("Invalid model session ID.");
  return path.join(root, "runs", id);
}

export async function newSessionDirectory(root: string, mode: AuthoringSession["mode"]) {
  const id = `${mode === "fixture" ? "demo" : "model"}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const directory = sessionDirectory(root, id);
  await mkdir(path.join(root, "runs"), { recursive: true });
  await mkdir(directory);
  return { id, directory };
}

export async function writeArtifact(directory: string, name: string, value: unknown): Promise<void> {
  const file = path.join(directory, name);
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}

export async function loadSession(root: string, id: string): Promise<AuthoringSession> {
  const session = sessionSchema.parse(await readJson(path.join(sessionDirectory(root, id), "session.json")));
  if (session.id !== id) throw new Error("Session ID does not match its directory.");
  return session;
}

export async function withSessionLock<T>(directory: string, execute: () => Promise<T>): Promise<T> {
  const file = path.join(directory, "session.lock");
  let lock;
  try { lock = await open(file, "wx", 0o600); }
  catch { throw new Error("Session is locked or inaccessible. Another command may be using it."); }
  try { return await execute(); }
  finally { await lock.close(); await unlink(file); }
}
