import type { IncomingMessage, ServerResponse } from "node:http";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { z } from "zod";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// A decision is an id, a verdict and a short note; anything larger is not a decision.
const MAX_DECISION_REQUEST_BYTES = 8192;
export const gapFolderName = new RegExp(`^draft-gaps-${uuid}$`);
export const repairFolderName = new RegExp(`^repair-${uuid}$`);
const listLimit = 200;

const gapSchema = z.object({
  id: z.string().min(1).max(200),
  statement: z.string(),
  why: z.string(),
  scenario: z.string(),
});
const proposalSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.string(),
  mode: z.string(),
  project: z.string(),
  caseId: z.string(),
  reviewedCandidate: z.boolean().nullable().optional(),
  approvedExportHash: z.string().optional(),
  gaps: z.array(gapSchema),
  note: z.string().optional(),
});
const decisionSchema = z.strictObject({
  id: z.string().min(1).max(200),
  decision: z.enum(["confirmed", "rejected"]),
  note: z.string().max(1000).optional(),
  decidedAt: z.iso.datetime(),
});
const decisionsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  decisions: z.array(decisionSchema),
});
const decisionBodySchema = z.strictObject({
  id: z.string().min(1).max(200),
  decision: z.enum(["confirmed", "rejected"]),
  note: z.string().max(1000).optional(),
});
const exportSchema = z.object({
  stage: z.string().optional(),
  instructions: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});
const usageSchema = z.object({
  entries: z.array(
    z.object({ state: z.string().optional(), costNanounits: z.number().optional() }).loose(),
  ),
});

type Decision = z.infer<typeof decisionSchema>;

async function readText(file: string, limit: number) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const entry = await handle.stat();
    if (!entry.isFile()) throw new Error("Not a regular file.");
    if (entry.size > limit) throw new Error("File is too large to review.");
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}
async function readJson(file: string, limit = 2_000_000): Promise<unknown> {
  const text = await readText(file, limit);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Not valid JSON: ${path.basename(file)}`);
  }
}
async function exists(file: string) {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Resolves a gap or repair folder id strictly inside the runs root. */
export async function confinedFolder(root: string, id: string, pattern: RegExp) {
  if (!pattern.test(id)) throw new Error("Unknown review folder.");
  const directory = path.join(root, id);
  const entry = await lstat(directory);
  if (!entry.isDirectory() || entry.isSymbolicLink())
    throw new Error("Unknown review folder.");
  const resolved = await realpath(directory);
  if (path.dirname(resolved) !== root) throw new Error("Unknown review folder.");
  return resolved;
}

async function readDecisions(directory: string): Promise<Decision[]> {
  const file = path.join(directory, "decisions.json");
  if (!(await exists(file))) return [];
  return decisionsFileSchema.parse(await readJson(file, 1_000_000)).decisions;
}
async function readProposal(directory: string) {
  const file = path.join(directory, "proposal.json");
  if (!(await exists(file))) return undefined;
  return proposalSchema.parse(await readJson(file));
}
async function readCostUsd(directory: string) {
  const file = path.join(directory, "model-usage.json");
  if (!(await exists(file))) return undefined;
  try {
    const usage = usageSchema.parse(await readJson(file));
    const nanounits = usage.entries
      .filter((entry) => entry.state === "settled")
      .reduce((total, entry) => total + (entry.costNanounits ?? 0), 0);
    return nanounits / 1e9;
  } catch {
    return undefined;
  }
}
function counts(gaps: { id: string }[], decisions: Decision[]) {
  const byId = new Map(decisions.map((item) => [item.id, item.decision]));
  const confirmed = gaps.filter((gap) => byId.get(gap.id) === "confirmed").length;
  const rejected = gaps.filter((gap) => byId.get(gap.id) === "rejected").length;
  return {
    proposed: gaps.length,
    confirmed,
    rejected,
    undecided: gaps.length - confirmed - rejected,
  };
}

async function summary(root: string, id: string) {
  const directory = await confinedFolder(root, id, gapFolderName);
  const created = (await lstat(directory)).mtime.toISOString();
  const costUsd = await readCostUsd(directory);
  let proposal;
  try {
    proposal = await readProposal(directory);
  } catch {
    return { id, created, costUsd, unreadable: true as const };
  }
  if (!proposal) {
    if (!(await exists(path.join(directory, "export.json")))) return undefined;
    return { id, created, costUsd, previewOnly: true as const };
  }
  let decisions: Decision[] = [];
  let decisionsUnreadable = false;
  try {
    decisions = await readDecisions(directory);
  } catch {
    decisionsUnreadable = true;
  }
  return {
    id,
    created,
    costUsd,
    previewOnly: false as const,
    project: proposal.project,
    caseId: proposal.caseId,
    mode: proposal.mode,
    reviewedCandidate: proposal.reviewedCandidate ?? null,
    counts: counts(proposal.gaps, decisions),
    ...(decisionsUnreadable ? { decisionsUnreadable: true } : {}),
  };
}

export async function listGapReviews(root: string) {
  const entries = (await readdir(root, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && gapFolderName.test(entry.name),
  );
  const reviews = [];
  for (const entry of entries.slice(0, listLimit)) {
    try {
      const item = await summary(root, entry.name);
      if (item) reviews.push(item);
    } catch {
      /* Folders that vanish or cannot be read are omitted. */
    }
  }
  reviews.sort((a, b) => b.created.localeCompare(a.created));
  return { reviews, ...(entries.length > listLimit ? { truncated: true } : {}) };
}

function sourceNames(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .map((item) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object" && typeof (item as { path?: unknown }).path === "string"
            ? (item as { path: string }).path
            : undefined,
      )
      .filter((item): item is string => item !== undefined);
  if (value && typeof value === "object") return Object.keys(value);
  return [];
}

export async function readGapReview(root: string, id: string) {
  const directory = await confinedFolder(root, id, gapFolderName);
  const created = (await lstat(directory)).mtime.toISOString();
  let sent: { instructions?: string; sources: string[]; proposedFix: boolean } | undefined;
  try {
    const value = exportSchema.parse(
      await readJson(path.join(directory, "export.json"), 10_000_000),
    );
    const fix = value.input?.proposedFix;
    sent = {
      instructions: value.instructions,
      sources: sourceNames(value.input?.sources),
      proposedFix: fix !== undefined && fix !== null && fix !== "",
    };
  } catch {
    sent = undefined;
  }
  const proposal = await readProposal(directory);
  if (!proposal) {
    if (!sent) throw new Error("Unknown review folder.");
    return { id, created, previewOnly: true, gaps: [], sent };
  }
  const decisions = await readDecisions(directory);
  const byId = new Map(decisions.map((item) => [item.id, item]));
  return {
    id,
    created,
    previewOnly: false,
    project: proposal.project,
    caseId: proposal.caseId,
    mode: proposal.mode,
    status: proposal.status,
    reviewedCandidate: proposal.reviewedCandidate ?? null,
    approvedExportHash: proposal.approvedExportHash,
    note: proposal.note ?? "",
    costUsd: await readCostUsd(directory),
    counts: counts(proposal.gaps, decisions),
    gaps: proposal.gaps.map((gap) => {
      const decision = byId.get(gap.id);
      return {
        ...gap,
        decision: decision?.decision ?? null,
        decisionNote: decision?.note,
        decidedAt: decision?.decidedAt,
      };
    }),
    sent,
  };
}

const writes = new Map<string, Promise<unknown>>();
export async function saveGapDecision(root: string, id: string, body: unknown) {
  const directory = await confinedFolder(root, id, gapFolderName);
  const input = decisionBodySchema.parse(body);
  const previous = writes.get(directory) ?? Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(async () => {
      const proposal = await readProposal(directory);
      if (!proposal) throw new Error("This preview has no proposed gaps to decide.");
      if (!proposal.gaps.some((gap) => gap.id === input.id))
        throw new Error("Unknown gap for this proposal.");
      const note = input.note?.trim();
      const entry: Decision = {
        id: input.id,
        decision: input.decision,
        ...(note ? { note } : {}),
        decidedAt: new Date().toISOString(),
      };
      const decisions = [
        ...(await readDecisions(directory)).filter((item) => item.id !== input.id),
        entry,
      ];
      const content = decisionsFileSchema.parse({ schemaVersion: 1, decisions });
      const target = path.join(directory, "decisions.json");
      const temporary = path.join(
        directory,
        `.decisions-${randomBytes(6).toString("hex")}.tmp`,
      );
      try {
        await writeFile(temporary, JSON.stringify(content, null, 2) + "\n", {
          flag: "wx",
        });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    });
  writes.set(directory, task);
  try {
    await task;
  } finally {
    if (writes.get(directory) === task) writes.delete(directory);
  }
  return readGapReview(root, id);
}

const resultSchema = z
  .object({
    caseId: z.string().optional(),
    expectationIds: z.array(z.string()).optional(),
    outcome: z.string().optional(),
    unmet: z.array(z.string()).optional(),
    evidence: z.string().optional(),
    mode: z.string().optional(),
  })
  .loose();
const roundSchema = z
  .object({
    round: z.number().optional(),
    fixDirectory: z.string().optional(),
    patchPath: z.string().optional(),
    patchHash: z.string().optional(),
    results: z.array(resultSchema).optional(),
  })
  .loose();
const stateSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().optional(),
    suite: z.string().optional(),
    project: z.string().optional(),
    status: z.string(),
    maxRounds: z.number().optional(),
    pending: z
      .object({
        stage: z.string().optional(),
        round: z.number().optional(),
        exportPath: z.string().optional(),
        exportHash: z.string().optional(),
      })
      .loose()
      .nullable()
      .optional(),
    rounds: z.array(roundSchema).optional(),
    review: z
      .object({ directory: z.string().optional(), proposalPath: z.string().optional() })
      .loose()
      .nullable()
      .optional(),
    outcome: z.string().nullable().optional(),
    spendUsd: z.number().optional(),
  })
  .loose();

const base = (value: string | undefined) =>
  value ? path.basename(value) : undefined;

async function readRepairState(directory: string) {
  const state = stateSchema.parse(
    await readJson(path.join(directory, "state.json"), 5_000_000),
  );
  const reviewFolder = base(state.review?.directory ?? (state.review?.proposalPath ? path.dirname(state.review.proposalPath) : undefined));
  return {
    suite: state.suite,
    project: state.project,
    status: state.status,
    maxRounds: state.maxRounds,
    pending: state.pending
      ? {
          stage: state.pending.stage,
          round: state.pending.round,
          exportFile: base(state.pending.exportPath),
          exportHash: state.pending.exportHash,
        }
      : null,
    rounds: (state.rounds ?? []).map((round) => ({
      round: round.round,
      fixFolder: base(round.fixDirectory),
      patchFile: base(round.patchPath),
      patchHash: round.patchHash,
      results: (round.results ?? []).map((result) => ({
        caseId: result.caseId,
        expectationIds: result.expectationIds ?? [],
        outcome: result.outcome ?? "unknown",
        unmet: result.unmet ?? [],
        evidence: result.evidence,
        mode: result.mode,
      })),
    })),
    reviewId:
      reviewFolder && gapFolderName.test(reviewFolder) ? reviewFolder : undefined,
    outcome: state.outcome ?? null,
    spendUsd: state.spendUsd,
  };
}

export async function readRepairSession(root: string, id: string) {
  const directory = await confinedFolder(root, id, repairFolderName);
  const created = (await lstat(directory)).mtime.toISOString();
  try {
    return {
      id,
      created,
      unreadable: false as const,
      ...(await readRepairState(directory)),
    };
  } catch {
    return { id, created, unreadable: true as const };
  }
}

export async function listRepairSessions(root: string) {
  const entries = (await readdir(root, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && repairFolderName.test(entry.name),
  );
  const sessions = [];
  for (const entry of entries.slice(0, listLimit)) {
    try {
      const session = await readRepairSession(root, entry.name);
      sessions.push(
        session.unreadable
          ? session
          : {
              id: session.id,
              created: session.created,
              unreadable: false,
              project: session.project,
              suite: session.suite,
              status: session.status,
              outcome: session.outcome,
              rounds: session.rounds?.length ?? 0,
              spendUsd: session.spendUsd,
            },
      );
    } catch {
      /* Folders that vanish are omitted. */
    }
  }
  sessions.sort((a, b) => b.created.localeCompare(a.created));
  return { sessions, ...(entries.length > listLimit ? { truncated: true } : {}) };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  if (request.headers["content-type"] !== "application/json")
    throw new Error("Send application/json.");
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_DECISION_REQUEST_BYTES) throw new Error("Decision request is too large.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Decision request must contain valid JSON.");
  }
}

export const gapDecisionPath = new RegExp(`^/api/gaps/(draft-gaps-${uuid})/decisions$`);

/** Handles /api/gaps and /api/repairs. Returns false when the path is not ours. */
export async function reviewApi(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
) {
  const send = (status: number, value: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(value));
  };
  const decision = gapDecisionPath.exec(pathname);
  const gap = /^\/api\/gaps\/([^/]+)$/.exec(pathname);
  const repair = /^\/api\/repairs\/([^/]+)$/.exec(pathname);
  if (
    !decision &&
    !gap &&
    !repair &&
    pathname !== "/api/gaps" &&
    pathname !== "/api/repairs"
  )
    return false;
  try {
    if (decision) {
      if (request.method !== "POST") {
        send(405, { error: "Unsupported request method." });
        return true;
      }
      send(200, { review: await saveGapDecision(root, decision[1]!, await readBody(request)) });
      return true;
    }
    if (request.method !== "GET") {
      send(405, { error: "Unsupported request method." });
      return true;
    }
    if (pathname === "/api/gaps") send(200, await listGapReviews(root));
    else if (pathname === "/api/repairs") send(200, await listRepairSessions(root));
    else if (gap) send(200, { review: await readGapReview(root, decodeURIComponent(gap[1]!)) });
    else send(200, { session: await readRepairSession(root, decodeURIComponent(repair![1]!)) });
  } catch (error) {
    const missing =
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      (error instanceof Error && error.message === "Unknown review folder.");
    send(missing ? 404 : 400, {
      error: missing
        ? "Unknown review folder."
        : error instanceof z.ZodError
          ? "Invalid review request or unreadable review file."
          : error instanceof Error
            ? error.message
            : "Could not read the review.",
    });
  }
  return true;
}
