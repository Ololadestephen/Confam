import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { detectProject } from "./detect.js";

const dirs: string[] = [];
async function directory() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "confam-detect-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

it("reports missing, oversized, and malformed manifests", async () => {
  const dir = await directory();
  expect((await detectProject(dir)).kind).toBe("Unsupported");
  await writeFile(path.join(dir, "package.json"), "x".repeat(128 * 1024 + 1));
  expect((await detectProject(dir)).issues.join()).toContain("128 KiB");
  await writeFile(path.join(dir, "package.json"), "{");
  expect((await detectProject(dir)).issues.join()).toContain("malformed");
});
it.each([
  ["next", "Next.js"],
  ["vite", "Vite"],
])("detects %s with unverified argv", async (dependency, kind) => {
  const dir = await directory();
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "example",
      dependencies: { [dependency]: "1" },
      scripts: { dev: "anything" },
    }),
  );
  expect(await detectProject(dir)).toMatchObject({
    name: "example",
    kind,
    commands: [
      {
        label: "npm run dev",
        command: ["npm", "run", "dev"],
        script: "anything",
      },
    ],
  });
});
it("rejects symlink roots and manifests", async () => {
  const dir = await directory();
  const link = `${dir}-link`;
  dirs.push(link);
  await symlink(dir, link);
  await expect(detectProject(link)).rejects.toThrow("non-symlink");
  await symlink("missing", path.join(dir, "package.json"));
  expect((await detectProject(dir)).kind).toBe("Unsupported");
});
it("loads a validated configuration and refuses malformed configuration", async () => {
  const dir = await directory();
  await writeFile(path.join(dir, "main.js"), "");
  const file = path.join(dir, "project.json");
  await writeFile(
    file,
    JSON.stringify({
      schemaVersion: 1,
      id: "example",
      root: ".",
      sourceFiles: ["main.js"],
      runtime: {
        command: ["node", "main.js"],
        readinessPath: "/",
        portVariable: "PORT",
        dataVariable: "DATA",
        restart: false,
      },
    }),
  );
  expect(await detectProject(dir)).toMatchObject({
    kind: "Confam project",
    configPath: await realpath(file),
    commands: [{ command: ["node", "main.js"] }],
  });
  await writeFile(file, "{}");
  expect((await detectProject(dir)).issues.join()).toContain("invalid");
});
it("rejects private held-out paths before inspection", async () => {
  await expect(
    detectProject(path.join(os.tmpdir(), "evals/heldout/missing")),
  ).rejects.toThrow("Private held-out");
});

it("exposes lifecycle scripts and ambiguous command choices", async () => {
  const dir = await directory();
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "x".repeat(201),
      scripts: {
        dev: "vite",
        start: "node app",
        predev: "setup",
        poststart: "cleanup",
      },
    }),
  );
  const result = await detectProject(dir);
  expect(result.name).toHaveLength(200);
  expect(result.issues.join()).toContain("predev lifecycle script: setup");
  expect(result.issues.join()).toContain("poststart lifecycle script: cleanup");
  expect(result.issues.join()).toContain("Both dev and start");
});

it.each(["sourceFiles", "cwd"])(
  "rejects a private held-out %s before loading configuration",
  async (field) => {
    const dir = await directory();
    const config = {
      schemaVersion: 1,
      id: "example",
      root: ".",
      sourceFiles: ["main.js"],
      runtime: {
        command: ["node", "main.js"],
        cwd: ".",
        readinessPath: "/",
        portVariable: "PORT",
        dataVariable: "DATA",
        restart: false,
      },
    };
    if (field === "sourceFiles")
      config.sourceFiles = ["evals/heldout/missing.js"];
    else config.runtime.cwd = "evals/heldout/missing";
    await writeFile(path.join(dir, "project.json"), JSON.stringify(config));
    expect((await detectProject(dir)).issues.join()).toContain("invalid");
  },
);
