import { createServer, type ServerResponse } from "node:http";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { RunView } from "./view.js";
import { hasReport, RunCatalog } from "./catalog.js";
import { redact } from "./artifacts.js";
import { confinedPath } from "../project/config.js";

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".zip": "application/zip",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}
function summary(view: unknown) {
  const {
    runId,
    project,
    caseId,
    status,
    verdict,
    expectations,
    limitations,
    development,
    independent,
    variants,
  } = view as Record<string, unknown>;
  const rows = Array.isArray(variants)
    ? variants.map((item) => {
        const { id, kind, outcome, expectationId, assertions, probes } =
          item as Record<string, unknown>;
        return { id, kind, outcome, expectationId, assertions, probes };
      })
    : [];
  return redact(
    {
      exportFormat: "confam-redacted-summary-v1",
      runId,
      project,
      caseId,
      status,
      verdict,
      expectations,
      limitations,
      development,
      independent,
      variants: rows,
      note: "Summary only. Recordings, traces, logs, source and local artifact links are excluded. Review before sharing.",
    },
    true,
  );
}
async function sendFile(
  response: ServerResponse,
  file: string,
  range: string | undefined,
  attachment = false,
) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const entry = await handle.stat();
    if (!entry.isFile()) throw new Error("Not a regular file.");
    const headers: Record<string, string | number> = {
      "Content-Type": mime[path.extname(file)] ?? "text/plain; charset=utf-8",
      "Accept-Ranges": "bytes",
    };
    if (attachment)
      headers["Content-Disposition"] =
        'attachment; filename="evidence' +
        path.extname(file).replace(/[^.a-z0-9]/gi, "") +
        '"';
    let start = 0;
    let end = entry.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        response.writeHead(416);
        response.end();
        return;
      }
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : end;
      } else start = Math.max(0, entry.size - Number(match[2]));
      end = Math.min(end, entry.size - 1);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= entry.size
      ) {
        response.writeHead(416);
        response.end();
        return;
      }
      headers["Content-Range"] = `bytes ${start}-${end}/${entry.size}`;
    }
    headers["Content-Length"] = Math.max(0, end - start + 1);
    response.writeHead(range ? 206 : 200, headers);
    if (!entry.size) {
      response.end();
      return;
    }
    const stream = handle.createReadStream({ start, end, autoClose: false });
    await new Promise<void>((resolve) => {
      stream.on("error", () => {
        response.destroy();
        resolve();
      });
      response.on("close", () => {
        stream.destroy();
        resolve();
      });
      stream.on("end", resolve);
      stream.pipe(response);
    });
  } finally {
    await handle.close();
  }
}

export async function startReviewServer(
  directory: string,
  options: { port?: number; assetRoot?: string } = {},
) {
  const root = await realpath(directory);
  if (!(await lstat(root)).isDirectory())
    throw new Error("Select a run directory.");
  const token = randomBytes(24).toString("hex");
  const selected = await hasReport(root);
  const view = selected ? new RunView(root, token) : undefined;
  if (view) await view.read();
  const catalog = new RunCatalog(root, token);
  const resolveView = async (id: string | null) => {
    if (view) {
      if (id && id !== path.basename(root)) throw new Error("Unknown run.");
      return view;
    }
    if (!id) throw new Error("Run required.");
    return catalog.get(id);
  };
  const scopedId = (id: string, artifact: string) =>
    createHash("sha256").update(id).update("\0").update(artifact).digest("hex");
  const readView = async (current: RunView, id: string | null) => {
    const value = await current.read();
    if (selected) return value;
    const append = (item: unknown): unknown => {
      if (Array.isArray(item)) return item.map(append);
      if (item && typeof item === "object")
        return Object.fromEntries(
          Object.entries(item).map(([key, child]) => [
            key,
            key === "url" &&
            typeof child === "string" &&
            child.startsWith("/api/artifacts/")
              ? `${child.replace(/\/api\/artifacts\/([a-f0-9]{64})/, (_, artifact: string) => `/api/artifacts/${scopedId(id!, artifact)}`)}&run=${encodeURIComponent(id!)}`
              : append(child),
          ]),
        );
      return item;
    };
    return append(value);
  };
  const assets =
    options.assetRoot ??
    fileURLToPath(new URL("../../dist/web", import.meta.url));
  const clients = new Map<
    ServerResponse,
    { view: RunView; id: string | null; previous: string; refreshing: boolean }
  >();
  let port = 0;
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(request.headers.host ?? "")) {
      json(response, 403, { error: "Local host required." });
      return;
    }
    if (request.method !== "GET") {
      json(response, 405, { error: "This review server is read-only." });
      return;
    }
    const origin = request.headers.origin;
    if (origin && !hosts.some((host) => origin === `http://${host}`)) {
      json(response, 403, { error: "Same-origin requests required." });
      return;
    }
    void (async () => {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname.startsWith("/api/")) {
        if (url.searchParams.get("token") !== token) {
          json(response, 403, {
            error: "Open the review URL printed by the CLI.",
          });
          return;
        }
        if (url.pathname === "/api/runs") {
          if (view) {
            const {
              runId,
              project,
              caseId,
              status,
              verdict,
              fixture,
              durationMs,
            } = await view.read();
            json(response, 200, {
              runs: [
                {
                  runId,
                  project,
                  caseId,
                  status,
                  verdict,
                  fixture,
                  durationMs,
                },
              ],
            });
          } else json(response, 200, await catalog.list());
          return;
        }
        const id = url.searchParams.get("run");
        const current = await resolveView(id);
        if (url.pathname === "/api/run") {
          json(response, 200, await readView(current, id));
          return;
        }
        if (url.pathname === "/api/export") {
          const data = summary(await current.read());
          response.setHeader(
            "Content-Disposition",
            'attachment; filename="confam-summary.json"',
          );
          json(response, 200, data);
          return;
        }
        if (url.pathname === "/api/events") {
          response.writeHead(200, {
            "Content-Type": "text/event-stream",
            Connection: "keep-alive",
          });
          response.write(
            `event: run\ndata: ${JSON.stringify(await readView(current, id))}\n\n`,
          );
          clients.set(response, {
            view: current,
            id,
            previous: "",
            refreshing: false,
          });
          response.on("close", () => clients.delete(response));
          return;
        }
        const match = /^\/api\/artifacts\/([a-f0-9]{64})$/.exec(url.pathname);
        if (match) {
          const artifactId = selected
            ? match[1]
            : [...current.artifacts.entries.keys()].find(
                (key) => scopedId(id!, key) === match[1],
              );
          if (!artifactId) throw new Error("Unknown artifact.");
          const artifact = await current.artifacts.resolve(artifactId);
          await sendFile(
            response,
            artifact.file,
            request.headers.range,
            !["video"].includes(artifact.kind),
          );
          return;
        }
        json(response, 404, { error: "Unknown review endpoint." });
        return;
      }
      const spa =
        /^\/(?:runs(?:\/new|\/[^/]+(?:\/(?:expectations|live|compare|checks|decoys\/[^/]+))?)?|share\/[^/]+|guide)\/?$/.test(
          url.pathname,
        );
      const route =
        url.pathname === "/" || spa
          ? "index.html"
          : decodeURIComponent(url.pathname).slice(1);
      if (!/\.(?:html|js|css|svg|ico)$/.test(route)) {
        json(response, 404, { error: "Not found." });
        return;
      }
      const file = await confinedPath(assets, route);
      await sendFile(response, file, undefined);
    })().catch(() => {
      if (!response.headersSent)
        json(response, 404, {
          error: "Evidence unavailable or not declared by the selected run.",
        });
      else response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Review server address unavailable.");
  port = address.port;
  const interval = setInterval(() => {
    for (const [client, state] of clients) {
      if (state.refreshing) continue;
      state.refreshing = true;
      void readView(state.view, state.id)
        .then((value) => {
          const encoded = JSON.stringify(value);
          if (encoded !== state.previous) {
            state.previous = encoded;
            client.write(`event: run\ndata: ${encoded}\n\n`);
          }
        })
        .catch(() => {
          client.write(
            'event: unavailable\ndata: {"message":"Run metadata is being updated."}\n\n',
          );
        })
        .finally(() => {
          state.refreshing = false;
        });
    }
  }, 1000);
  return {
    url: `http://127.0.0.1:${port}/?token=${token}`,
    port,
    token,
    async close() {
      clearInterval(interval);
      for (const client of clients.keys()) client.end();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
