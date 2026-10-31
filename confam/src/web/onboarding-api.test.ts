import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startReviewServer } from "./server.js";
import { ProjectRegistry } from "../project/registry.js";
import type { ModelTransport } from "../models/client.js";
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action();
});
it("requires token, exact origin, schema and affirmative digest consent for model requests", async () => {
  const root = await mkdtemp(path.join(realpathSync(tmpdir()), "confam-on3-api-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const runs = path.join(root, "runs");
  await mkdir(runs);
  const app = path.join(root, "app");
  await mkdir(app);
  await writeFile(path.join(app, "main.cjs"), "// static fictional source");
  await writeFile(
    path.join(app, "project.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "different-app",
      root: ".",
      sourceFiles: ["main.cjs"],
      runtime: {
        command: ["node", "main.cjs"],
        readinessPath: "/ready",
        portVariable: "PORT",
        dataVariable: "STATE",
        restart: false,
      },
    }),
  );
  const registryDirectory = path.join(root, "registry");
  const registry = new ProjectRegistry(registryDirectory);
  const project = await registry.add(app);
  await registry.approve(project.id, project.revision);
  let calls = 0;
  const transport: ModelTransport = {
    mode: "fixture",
    count: async () => 100,
    generate: async () => {
      calls++;
      return {
        completed: true,
        text: JSON.stringify({
          summary: "Fictional report.",
          expectations: [
            { id: "R1", statement: "State remains.", provenance: "report" },
          ],
          questions: [],
          fixtures: [],
          observations: [],
        }),
        usage: { input: 100, output: 100, cached: 0 },
      };
    },
  };
  const server = await startReviewServer(runs, {
    registryDirectory,
    modelTransport: transport,
  });
  cleanup.push(() => server.close());
  const url = new URL("/api/onboarding?token=" + server.token, server.url);
  const post = (body: unknown, origin = new URL(server.url).origin) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  const input = {
    action: "preview",
    projectId: project.id,
    caseId: "stateWrong",
    report: "State disappears.",
  };
  expect((await post(input, "https://untrusted.example")).status).toBe(403);
  expect(
    (
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    ).status,
  ).toBe(403);
  const wrong = new URL(url);
  wrong.searchParams.set("token", "wrong");
  expect((await fetch(wrong)).status).toBe(403);
  let response = await post(input);
  expect(response.status).toBe(200);
  let session = (await response.json()).session;
  expect(calls).toBe(0);
  expect(
    (
      await post({
        action: "generate",
        id: session.id,
        hash: session.preview.hash,
        approve: false,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post({
        action: "generate",
        id: session.id,
        hash: "0".repeat(64),
        approve: true,
      })
    ).status,
  ).toBe(400);
  response = await post({
    action: "generate",
    id: session.id,
    hash: session.preview.hash,
    approve: true,
  });
  expect(response.status).toBe(200);
  session = (await response.json()).session;
  expect(session.status).toBe("requirements-review");
  expect(calls).toBe(1);
  expect(
    (
      await post({
        action: "generate",
        id: session.id,
        hash: session.preview.hash,
        approve: true,
      })
    ).status,
  ).toBe(400);
  expect(calls).toBe(1);
  expect(
    (
      await fetch(
        new URL(
          "/api/onboarding?token=" + server.token + "&id=" + session.id,
          server.url,
        ),
      )
    ).status,
  ).toBe(200);
});
