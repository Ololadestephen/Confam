import { strict as assert } from "node:assert";
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { ProjectRegistry } from "./registry.js";

test("registry persists, deduplicates, and requires review after changes", async () => {
  const base = await mkdtemp(
    path.join(await realpath(os.tmpdir()), "confam-registry-"),
  );
  try {
    const root = path.join(base, "app");
    await mkdir(root);
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "app", scripts: { dev: "vite" } }),
    );
    const dir = path.join(base, "state");
    const registry = new ProjectRegistry(dir);
    const [first, duplicate] = await Promise.all([
      registry.add(root),
      new ProjectRegistry(dir).add(root),
    ]);
    assert.equal(first.id, duplicate.id);
    assert.equal((await new ProjectRegistry(dir).list()).length, 1);
    assert.equal(
      (await registry.approve(first.id, first.revision)).approvedRevision,
      first.revision,
    );
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "app", scripts: { dev: "changed" } }),
    );
    await assert.rejects(registry.approve(first.id, first.revision), /changed/);
    const refreshed = await registry.add(root);
    assert.notEqual(refreshed.revision, first.revision);
    assert.equal(refreshed.approvedRevision, undefined);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("registry rejects symlinks, private paths, and corrupt storage", async () => {
  const base = await mkdtemp(
    path.join(await realpath(os.tmpdir()), "confam-registry-"),
  );
  try {
    const root = path.join(base, "app");
    await mkdir(root);
    await symlink(root, path.join(base, "link"));
    const dir = path.join(base, "state");
    const registry = new ProjectRegistry(dir);
    await assert.rejects(
      registry.add(path.join(base, "link")),
      /Unsafe directory/,
    );
    await assert.rejects(
      registry.add(path.join(base, "evals", "heldout")),
      /Private/,
    );
    await registry.list();
    await writeFile(path.join(dir, "projects.json"), "broken");
    await assert.rejects(registry.list(), /Corrupt/);
    await writeFile(
      path.join(dir, "projects.json"),
      JSON.stringify([
        {
          id: "bad",
          root,
          name: "app",
          revision: "bad",
          detection: { commands: [null] },
        },
      ]),
    );
    await assert.rejects(registry.list(), /Corrupt/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("oversized detected scripts and hooks cannot corrupt existing registry", async () => {
  const base = await mkdtemp(
    path.join(await realpath(os.tmpdir()), "confam-registry-"),
  );
  try {
    const good = path.join(base, "good");
    const bad = path.join(base, "bad");
    await mkdir(good);
    await mkdir(bad);
    await writeFile(
      path.join(good, "package.json"),
      JSON.stringify({ name: "good" }),
    );
    const registry = new ProjectRegistry(path.join(base, "state"));
    const saved = await registry.add(good);
    await writeFile(
      path.join(bad, "package.json"),
      JSON.stringify({
        scripts: { dev: "x".repeat(9000), predev: "y".repeat(9000) },
      }),
    );
    await assert.rejects(registry.add(bad), /registry limits/);
    assert.equal((await registry.list())[0]?.id, saved.id);
    assert.equal((await registry.list()).length, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
