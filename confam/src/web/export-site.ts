import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { RunCatalog } from "./catalog.js";
import { listGapReviews, listRepairSessions, readGapReview, readRepairSession } from "./gaps-api.js";

// Builds the read-only evidence site: the same JSON the local review API serves, written as static files for the
// selected runs, gap reviews and repair sessions. Only evidence leaves the machine: no application source, and for
// private applications no patches or recordings. Local paths are scrubbed.

const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generatedFrom: z.string().min(1).max(500),
  runs: z.array(z.string().regex(/^[a-z]+-[0-9a-f-]{36}$/)).min(1).max(100),
  // Project ids whose source is private: their runs keep results but lose patches and recordings.
  privateProjects: z.array(z.string().min(1).max(100)).max(50),
});
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const STATIC_TOKEN = "static";

type Json = unknown;
function scrubber(root: string) {
  const prefixes = [[path.resolve(root, "..") + path.sep, ""], [os.homedir() + path.sep, "~/"]] as const;
  const text = (value: string) => prefixes.reduce((result, [prefix, replacement]) => result.split(prefix).join(replacement), value);
  const json = (value: Json): Json => Array.isArray(value) ? value.map(json)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, json(child)]))
      : typeof value === "string" ? text(value) : value;
  return { text, json };
}

const isPrivate = (project: string, privateProjects: string[]) => privateProjects.some((name) => project === name || project.startsWith(`${name}-`));

export async function exportSite(options: { runsRoot: string; manifest: string; out: string }) {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(options.manifest, "utf8")));
  const root = path.resolve(options.runsRoot);
  const scrub = scrubber(root);
  await rm(options.out, { recursive: true, force: true });
  const write = async (relative: string, value: Json) => {
    const file = path.join(options.out, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(scrub.json(value)) + "\n");
  };

  const catalog = new RunCatalog(root, STATIC_TOKEN);
  const summaries = [];
  const skipped: string[] = [];
  let copied = 0;
  for (const id of manifest.runs) {
    const view = await catalog.get(id);
    const value = await view.read();
    const privateRun = isPrivate(value.project, manifest.privateProjects);
    const links = new Map<string, string>();
    for (const [artifactId, artifact] of view.artifacts.entries) {
      const allowed = artifact.kind === "json" || artifact.kind === "text"
        || (!privateRun && artifact.kind === "patch")
        || (!privateRun && artifact.kind === "video" && (await stat(artifact.file)).size <= MAX_VIDEO_BYTES);
      if (!allowed) continue;
      const published = `artifacts/${id}/${artifactId}${path.extname(artifact.file)}`;
      const target = path.join(options.out, published);
      await mkdir(path.dirname(target), { recursive: true });
      if (artifact.kind === "json") await writeFile(target, JSON.stringify(scrub.json(JSON.parse(await readFile(artifact.file, "utf8"))), null, 2) + "\n");
      else if (artifact.kind === "video") await copyFile(artifact.file, target);
      else await writeFile(target, scrub.text(await readFile(artifact.file, "utf8")));
      links.set(artifactId, `/data/${published}`);
      copied += 1;
    }
    // Links to evidence that stays local get a non-web address, which the interface shows as unavailable.
    const relink = (item: Json): Json => Array.isArray(item) ? item.map(relink)
      : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).map(([key, child]) => {
        const match = key === "url" && typeof child === "string" ? /^\/api\/artifacts\/([a-f0-9]{64})/.exec(child) : null;
        if (!match) return [key, relink(child)];
        const local = links.get(match[1]!);
        if (!local) skipped.push(`${id}: ${(item as { label?: string }).label ?? match[1]}`);
        return [key, local ?? "unavailable:recorded-locally"];
      })) : item;
    await write(`runs/${id}.json`, relink(value));
    const { runId, project, caseId, status, verdict, fixture, durationMs } = value;
    summaries.push({ runId, project, caseId, status, verdict, fixture, durationMs });
  }
  await write("runs.json", { runs: summaries });

  const gaps = await listGapReviews(root);
  const reviews = gaps.reviews.filter((review: { previewOnly?: boolean; unreadable?: boolean }) => !review.previewOnly && !review.unreadable);
  await write("gaps.json", { ...gaps, reviews });
  for (const review of reviews as { id: string }[]) await write(`gaps/${review.id}.json`, { review: await readGapReview(root, review.id) });
  const repairs = await listRepairSessions(root);
  await write("repairs.json", repairs);
  for (const session of repairs.sessions as { id: string }[]) await write(`repairs/${session.id}.json`, { session: await readRepairSession(root, session.id) });

  await write("site.json", {
    generatedAt: new Date().toISOString(), generatedFrom: manifest.generatedFrom,
    notice: "Recorded results from real runs. Nothing runs on this site; to run Confam, clone it or use the GitHub Action.",
  });
  return { runs: summaries.length, gaps: reviews.length, repairs: repairs.sessions.length, artifacts: copied, unavailable: skipped.length };
}
