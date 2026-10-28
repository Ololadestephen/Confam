import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { checkProject } from "./check.js";

it("checks an arbitrary runtime through a snapshot without changing the source project", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-project-check-"));
  try {
    const app = path.join(directory, "app");
    await mkdir(app);
    const source = "require('node:http').createServer((req,res)=>res.end('ready')).listen(Number(process.env.CUSTOM_PORT),'127.0.0.1');\n";
    await writeFile(path.join(app, "entry.cjs"), source);
    const config = { schemaVersion: 1, id: "custom", root: "app", sourceFiles: ["entry.cjs"], runtime: {
      command: [process.execPath, "entry.cjs"], readinessPath: "/custom", timeoutMs: 2000,
      portVariable: "CUSTOM_PORT", dataVariable: "STATE_FILE", restart: false,
    } };
    const configFile = path.join(directory, "project.json");
    await writeFile(configFile, JSON.stringify(config));
    const { report, reportPath } = await checkProject(configFile, path.join(directory, "runs"));
    expect(report).toMatchObject({ status: "ready", restarted: false, dataReset: true });
    expect(report.scope).toContain("no behavioral checks");
    expect(await readFile(path.join(app, "entry.cjs"), "utf8")).toBe(source);
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual(report);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
