import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startReviewServer } from "./server.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action();
});
it("authenticates project mutations, persists detection and rejects stale review", async () => {
  const root = await mkdtemp(path.join(realpathSync(tmpdir()), "confam-project-api-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  const runs = path.join(root, "runs");
  await mkdir(app);
  await mkdir(runs);
  const manifest = path.join(app, "package.json");
  await writeFile(
    manifest,
    JSON.stringify({
      name: "outside-app",
      scripts: { dev: "vite --host 127.0.0.1" },
      devDependencies: { vite: "8" },
    }),
  );
  let server = await startReviewServer(runs);
  cleanup.push(() => server.close());
  const post = (
    body: unknown,
    token = server.token,
    origin = new URL(server.url).origin,
  ) =>
    fetch(new URL(`/api/projects?token=${token}`, server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  expect((await post({ action: "add", root: app }, "wrong")).status).toBe(403);
  expect(
    (
      await post(
        { action: "add", root: app },
        server.token,
        "https://outside.example",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(new URL("/api/projects?token=" + server.token, server.url), {
        method: "POST",
      })
    ).status,
  ).toBe(403);
  const added = await post({ action: "add", root: app });
  expect(added.status).toBe(200);
  const { project } = await added.json();
  expect(project.detection.kind).toBe("Vite");
  expect(project.detection.commands[0].script).toContain("vite");
  expect(
    (
      await post({
        action: "approve",
        id: project.id,
        revision: project.revision,
      })
    ).status,
  ).toBe(200);
  await writeFile(
    manifest,
    JSON.stringify({ scripts: { start: "node changed.cjs" } }),
  );
  const stale = await post({
    action: "approve",
    id: project.id,
    revision: project.revision,
  });
  expect(stale.status).toBe(400);
  expect((await stale.json()).error).toContain("changed");
  expect((await post({ action: "execute", id: project.id })).status).toBe(400);
  expect(
    (await post({ action: "add", root: app, command: "touch forbidden" }))
      .status,
  ).toBe(400);
  expect(
    (await post({ action: "add", root: path.join(root, "evals", "heldout", "no-read") }))
      .status,
  ).toBe(400);
  await server.close();
  server = await startReviewServer(runs);
  const list = await fetch(
    new URL("/api/projects?token=" + server.token, server.url),
  ).then((value) => value.json());
  expect(list.projects).toHaveLength(1);
  expect(list.projects[0].id).toBe(project.id);
  expect(list.projects[0].approvedRevision).toBeUndefined();
});
