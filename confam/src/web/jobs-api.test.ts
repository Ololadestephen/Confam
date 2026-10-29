import { afterEach, expect, it } from "vitest";
import { executionFixture, until } from "../jobs/fixtures.test-helper.js";
import { startReviewServer } from "./server.js";
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action();
});
it("authenticates execution approval and exposes actual worker state and evidence routes", async () => {
  const f = await executionFixture();
  cleanup.push(() => f.cleanup());
  const server = await startReviewServer(f.runs, {
    registryDirectory: f.registryDirectory,
    modelTransport: f.transport,
  });
  cleanup.push(() => server.close());
  const endpoint = (route: string) =>
    new URL(
      route + (route.includes("?") ? "&" : "?") + "token=" + server.token,
      server.url,
    );
  const post = (body: unknown, origin = new URL(server.url).origin) =>
    fetch(endpoint("/api/jobs"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  const input = {
    action: "preview",
    draftId: f.draft.id,
    candidate: { name: "good.patch", text: f.patch },
  };
  expect((await post(input, "https://other.example")).status).toBe(403);
  expect(
    (
      await fetch(endpoint("/api/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    ).status,
  ).toBe(403);
  expect(
    (await fetch(new URL("/api/jobs?token=wrong", server.url))).status,
  ).toBe(403);
  let response = await post(input);
  expect(response.status).toBe(200);
  const { job } = await response.json();
  expect(
    (
      await post({
        action: "start",
        id: job.id,
        hash: job.preview.hash,
        approve: false,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post({
        action: "start",
        id: job.id,
        hash: job.preview.hash,
        approve: true,
        project: "/arbitrary/path",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post({
        action: "start",
        id: job.id,
        hash: job.preview.hash,
        approve: true,
      })
    ).status,
  ).toBe(200);
  const result = await until(
    async () =>
      await fetch(endpoint("/api/jobs?id=" + job.id))
        .then((r) => r.json())
        .then((v) => v.job),
    (value) =>
      ["completed", "blocked", "error", "cancelled", "interrupted"].includes(
        value.status,
      ),
  );
  expect(result.status).toBe("completed");
  expect(result.cleanupComplete).toBe(true);
  expect((await fetch(endpoint("/api/run?run=" + result.runId))).status).toBe(
    200,
  );
  expect(
    (
      await post({
        action: "start",
        id: job.id,
        hash: job.preview.hash,
        approve: true,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(endpoint("/api/jobs?draft=" + f.draft.id)).then((r) =>
        r.json(),
      )
    ).jobs,
  ).toHaveLength(1);
});
