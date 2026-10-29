import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { RunView } from "./view.js";

const reports = [
  "challenge-report.json",
  "verification.json",
  "manifest.json",
  "recording-intake.json",
];
const runName =
  /^(?:verify-|challenge-|recording-)[a-zA-Z0-9][a-zA-Z0-9._-]*$|^\d{4}-\d{2}-\d{2}[a-zA-Z0-9._-]*$/;
export async function hasReport(directory: string) {
  for (const name of reports) {
    try {
      if ((await lstat(path.join(directory, name))).isFile()) return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return false;
}
export class RunCatalog {
  private views = new Map<string, RunView>();
  constructor(
    readonly root: string,
    readonly token: string,
  ) {}
  async get(id: string) {
    if (!runName.test(id)) throw new Error("Unknown run.");
    const directory = path.join(this.root, id);
    if (
      !(await lstat(directory)).isDirectory() ||
      !(await hasReport(directory))
    )
      throw new Error("Unknown run.");
    let view = this.views.get(id);
    if (!view) {
      view = new RunView(directory, this.token);
      this.views.set(id, view);
    }
    return view;
  }
  async list() {
    const entries = (await readdir(this.root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && runName.test(entry.name))
      .sort((a, b) => b.name.localeCompare(a.name));
    const runs = [];
    for (const entry of entries.slice(0, 200)) {
      try {
        const { runId, project, caseId, status, verdict, fixture, durationMs } =
          await (await this.get(entry.name)).read();
        runs.push({
          runId,
          project,
          caseId,
          status,
          verdict,
          fixture,
          durationMs,
        });
      } catch {
        /* Ignore incomplete or invalid runs. */
      }
    }
    return { runs, ...(entries.length > 200 ? { truncated: true } : {}) };
  }
}
