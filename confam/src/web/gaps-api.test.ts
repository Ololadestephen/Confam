import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startReviewServer } from "./server.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action();
});

const live = "draft-gaps-11111111-2222-4333-8444-555555555555";
const preview = "draft-gaps-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const broken = "draft-gaps-99999999-2222-4333-8444-555555555555";
const repair = "repair-11111111-2222-4333-8444-555555555555";
const badRepair = "repair-22222222-2222-4333-8444-555555555555";

async function fixture() {
  const root = await mkdtemp(path.join(realpathSync(tmpdir()), "confam-gaps-api-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const runs = path.join(root, "runs");
  await mkdir(path.join(runs, live), { recursive: true });
  await mkdir(path.join(runs, preview));
  await mkdir(path.join(runs, broken));
  await mkdir(path.join(runs, repair));
  await mkdir(path.join(runs, badRepair));
  await mkdir(path.join(runs, "draft-gaps-not-a-uuid"));
  const sent = {
    stage: "gaps",
    instructions: "Propose missed expectations.",
    input: {
      report: "Status resets after reload.",
      confirmedExpectations: [],
      sources: { "backend/main.cjs": "secret source body", "frontend/view.html": "<p/>" },
      proposedFix: "diff --git a b",
    },
  };
  await writeFile(path.join(runs, live, "export.json"), JSON.stringify(sent));
  await writeFile(
    path.join(runs, live, "proposal.json"),
    JSON.stringify({
      schemaVersion: 1,
      status: "needs-review",
      mode: "live",
      project: "task-board",
      caseId: "statusPersists",
      reviewedCandidate: true,
      gaps: ["first", "second", "third"].map((id) => ({
        id,
        statement: `${id} statement`,
        why: `${id} why`,
        scenario: `${id} scenario`,
      })),
      note: "Proposed expectations only.",
    }),
  );
  await writeFile(
    path.join(runs, live, "model-usage.json"),
    JSON.stringify({
      mode: "live",
      entries: [
        { stage: "gaps", model: "m", state: "settled", costNanounits: 8_120_750 },
        { stage: "gaps", model: "m", state: "reserved", costNanounits: 5_000_000 },
      ],
    }),
  );
  const { input: _input, ...withoutInput } = sent;
  void _input;
  await writeFile(
    path.join(runs, preview, "export.json"),
    JSON.stringify({ ...withoutInput, input: { report: "r", sources: { "app.js": "x" } } }),
  );
  await writeFile(path.join(runs, broken, "export.json"), JSON.stringify(sent));
  await writeFile(path.join(runs, broken, "proposal.json"), "{not json");
  await writeFile(
    path.join(runs, repair, "state.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: repair,
      suite: "suite.json",
      project: "task-board",
      status: "awaiting-approval",
      maxRounds: 2,
      pending: { stage: "gaps", round: 1, exportPath: "/abs/runs/x/export.json", exportHash: "a".repeat(64) },
      rounds: [
        {
          round: 1,
          fixDirectory: "/abs/fix-1",
          patchPath: "/abs/fix-1/candidate.patch",
          patchHash: "b".repeat(64),
          results: [
            { caseId: "statusPersists", expectationIds: ["E1"], outcome: "failed", unmet: ["E1"], evidence: "E1 failed", mode: "candidate" },
          ],
        },
      ],
      review: { directory: path.join(runs, live), proposalPath: path.join(runs, live, "proposal.json") },
      outcome: null,
      spendUsd: 0.02,
    }),
  );
  await writeFile(path.join(runs, badRepair, "state.json"), JSON.stringify({ schemaVersion: 7 }));
  const older = new Date(Date.now() - 60_000);
  await utimes(path.join(runs, preview), older, older);
  const server = await startReviewServer(runs, {
    registryDirectory: path.join(root, ".onboarding"),
  });
  cleanup.push(() => server.close());
  const get = (route: string, token = server.token) =>
    fetch(new URL(`${route}?token=${token}`, server.url));
  const post = (
    folder: string,
    body: unknown,
    { token = server.token, origin = new URL(server.url).origin as string | null } = {},
  ) =>
    fetch(new URL(`/api/gaps/${folder}/decisions?token=${token}`, server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(body),
    });
  return { root, runs, server, get, post };
}

it("lists gap proposals with counts, cost, previews and unreadable files", async () => {
  const { get } = await fixture();
  expect((await get("/api/gaps", "wrong")).status).toBe(403);
  const response = await get("/api/gaps");
  expect(response.status).toBe(200);
  const { reviews } = await response.json();
  expect(reviews.map((item: { id: string }) => item.id).sort()).toEqual(
    [broken, live, preview].sort(),
  );
  const first = reviews.find((item: { id: string }) => item.id === live);
  expect(first).toMatchObject({
    project: "task-board",
    caseId: "statusPersists",
    mode: "live",
    reviewedCandidate: true,
    previewOnly: false,
    counts: { proposed: 3, confirmed: 0, rejected: 0, undecided: 3 },
  });
  expect(first.costUsd).toBeCloseTo(0.00812075, 10);
  expect(reviews.find((item: { id: string }) => item.id === preview)).toMatchObject({ previewOnly: true });
  expect(reviews.find((item: { id: string }) => item.id === broken)).toMatchObject({ unreadable: true });
  expect(reviews.at(-1).id).toBe(preview);
});

it("shows what was sent without source contents", async () => {
  const { get } = await fixture();
  const { review } = await (await get(`/api/gaps/${live}`)).json();
  expect(review.sent).toEqual({
    instructions: "Propose missed expectations.",
    sources: ["backend/main.cjs", "frontend/view.html"],
    proposedFix: true,
  });
  expect(JSON.stringify(review)).not.toContain("secret source body");
  expect(review.gaps[0]).toMatchObject({ id: "first", decision: null });
  const previewed = await (await get(`/api/gaps/${preview}`)).json();
  expect(previewed.review).toMatchObject({ previewOnly: true, gaps: [] });
  expect(previewed.review.sent.proposedFix).toBe(false);
});

it("saves decisions atomically, replaces earlier decisions and guards mutations", async () => {
  const { runs, post } = await fixture();
  expect((await post(live, { id: "first", decision: "confirmed" }, { token: "wrong" })).status).toBe(403);
  expect(
    (await post(live, { id: "first", decision: "confirmed" }, { origin: "https://outside.example" })).status,
  ).toBe(403);
  expect((await post(live, { id: "first", decision: "confirmed" }, { origin: null })).status).toBe(403);
  expect((await post(live, { id: "missing", decision: "confirmed" })).status).toBe(400);
  expect((await post(live, { id: "first", decision: "maybe" })).status).toBe(400);
  expect((await post(live, { id: "first", decision: "confirmed", extra: 1 })).status).toBe(400);
  expect((await post(live, { id: "first", decision: "confirmed", note: "x".repeat(1001) })).status).toBe(400);
  expect((await post(preview, { id: "first", decision: "confirmed" })).status).toBe(400);

  const saved = await post(live, { id: "first", decision: "confirmed", note: "Matches the report." });
  expect(saved.status).toBe(200);
  expect((await saved.json()).review.counts).toEqual({ proposed: 3, confirmed: 1, rejected: 0, undecided: 2 });
  await post(live, { id: "second", decision: "rejected" });
  const replaced = await (await post(live, { id: "first", decision: "rejected" })).json();
  expect(replaced.review.counts).toEqual({ proposed: 3, confirmed: 0, rejected: 2, undecided: 1 });
  expect(replaced.review.gaps[0]).toMatchObject({ decision: "rejected" });
  expect(replaced.review.gaps[0].decisionNote).toBeUndefined();

  const file = JSON.parse(await readFile(path.join(runs, live, "decisions.json"), "utf8"));
  expect(file.schemaVersion).toBe(1);
  expect(file.decisions.map((item: { id: string }) => item.id)).toEqual(["second", "first"]);
  expect(Number.isNaN(Date.parse(file.decisions[1].decidedAt))).toBe(false);
  expect((await readdir(path.join(runs, live))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});

it("rejects traversal, malformed folder ids and linked folders", async () => {
  const { root, runs, get, post } = await fixture();
  const outside = path.join(root, "outside", live);
  await mkdir(outside, { recursive: true });
  const linked = "draft-gaps-33333333-2222-4333-8444-555555555555";
  await symlink(outside, path.join(runs, linked));
  for (const route of [
    "/api/gaps/..%2F..%2Fetc",
    "/api/gaps/draft-gaps-not-a-uuid",
    `/api/gaps/${linked}`,
    "/api/gaps/draft-gaps-44444444-2222-4333-8444-555555555555",
    "/api/repairs/..%2Frepair",
  ])
    expect((await get(route)).status).toBe(404);
  expect((await post("..%2Foutside", { id: "first", decision: "confirmed" })).status).toBe(405);
  expect((await post(linked, { id: "first", decision: "confirmed" })).status).toBe(404);
});

it("reads repair sessions read-only and tolerates malformed state", async () => {
  const { get } = await fixture();
  const { sessions } = await (await get("/api/repairs")).json();
  expect(sessions).toHaveLength(2);
  expect(sessions.find((item: { id: string }) => item.id === badRepair)).toMatchObject({ unreadable: true });
  const { session } = await (await get(`/api/repairs/${repair}`)).json();
  expect(session).toMatchObject({
    unreadable: false,
    status: "awaiting-approval",
    pending: { stage: "gaps", exportFile: "export.json" },
    reviewId: live,
    rounds: [{ patchFile: "candidate.patch", results: [{ outcome: "failed", unmet: ["E1"] }] }],
  });
  expect(JSON.stringify(session)).not.toContain("/abs/");
  const unreadable = await (await get(`/api/repairs/${badRepair}`)).json();
  expect(unreadable.session.unreadable).toBe(true);
});
