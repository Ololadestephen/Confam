// Confam runtime wrapper for the Linkding specimen. Runs inside each isolated variant copy.
// It prepares a fresh SQLite database with one fictional user and API token, starts a probe that stands in for an
// internal service, runs Django's server on a private port, and only then opens PORT with a small proxy in front.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const port = Number(process.env.PORT);
const data = process.env.CONFAM_DATA;
if (!port || !data) throw new Error("PORT and CONFAM_DATA are required.");
const { python } = JSON.parse(readFileSync(".confam-deps.json", "utf8"));
// Fixed so the reviewed workflow can name it; variants run one at a time.
const PROBE_PORT = 47901;
const TOKEN = "c0nfam0000000000000000000000000000000001";
// With --http-proxy, Linkding runs behind a forward proxy configured through the environment, as some deployments
// are. The wrapper is that proxy: it forwards each request to its target, like a proxy inside the same network.
const behindProxy = process.argv.includes("--http-proxy");
// With --proxy-resolves=NAME, the proxy's own DNS sends NAME to the internal probe while the app's DNS still sees the
// public address, as with split-horizon DNS or a rebinding answer that changes between two lookups.
const proxyResolves = process.argv.find((argument) => argument.startsWith("--proxy-resolves="))?.slice("--proxy-resolves=".length);
const listen = (server) => new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", () => resolve(server.address().port)));
let proxiedRequests = 0;
const proxyPort = behindProxy ? await listen(http.createServer((request, response) => {
  proxiedRequests += 1;
  const target = new URL(request.url);
  if (proxyResolves && target.hostname === proxyResolves) { target.hostname = "127.0.0.1"; target.port = String(PROBE_PORT); }
  const upstream = http.request(target, { method: request.method, headers: request.headers }, (reply) => {
    response.writeHead(reply.statusCode ?? 502, reply.headers); reply.pipe(response);
  });
  upstream.on("error", () => { response.statusCode = 502; response.end(); });
  request.pipe(upstream);
})) : undefined;
const env = {
  ...process.env,
  ...(proxyPort ? { HTTP_PROXY: `http://127.0.0.1:${proxyPort}`, http_proxy: `http://127.0.0.1:${proxyPort}`, NO_PROXY: "", no_proxy: "" } : {}), DJANGO_SETTINGS_MODULE: "bookmarks.settings.prod", LD_DISABLE_BACKGROUND_TASKS: "True",
  LD_ENABLE_REFRESH_FAVICONS: "False", LD_FAVICON_PROVIDER: `http://127.0.0.1:${PROBE_PORT}/favicon?url={url}`,
};
// Linkding keeps its database and files in ./data, as its own Docker bootstrap prepares it.
for (const folder of ["data/favicons", "data/previews", "data/assets"]) mkdirSync(folder, { recursive: true });
const manage = (...args) => execFileSync(python, ["manage.py", ...args], { env, stdio: ["ignore", "inherit", "inherit"] });
manage("migrate", "--no-input");
manage("shell", "-c", [
  "from django.contrib.auth.models import User",
  "from bookmarks.models import ApiToken",
  "user = User.objects.create_user('confam', password='fictional-password-for-tests')",
  `ApiToken.objects.create(user=user, key='${TOKEN}', name='Confam')`,
].join("; "));

// Independent observation for the reviewed probe: the wrapper, not the app, counts requests to the internal service.
const observations = path.join(path.dirname(data), "observations.json");
let internalRequests = 0;
const record = () => {
  writeFileSync(`${observations}.tmp`, JSON.stringify({ internalRequests, proxiedRequests }));
  renameSync(`${observations}.tmp`, observations);
};
record();
await new Promise((resolve, reject) => http.createServer((request, response) => {
  internalRequests += 1; record();
  response.setHeader("Content-Type", "text/html");
  response.end("<html><head><title>Internal admin panel</title></head><body>internal only</body></html>");
}).once("error", reject).listen(PROBE_PORT, "127.0.0.1", resolve));

const free = await new Promise((resolve) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const django = spawn(python, ["manage.py", "runserver", `127.0.0.1:${free}`, "--noreload"], { env, stdio: "inherit" });
const stop = () => { django.kill("SIGTERM"); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
django.once("exit", (code) => { console.error(`Django exited ${code}`); process.exit(1); });
for (let attempt = 0; ; attempt += 1) {
  try { const r = await fetch(`http://127.0.0.1:${free}/health`); await r.body?.cancel(); if (r.ok) break; } catch { /* starting */ }
  if (attempt > 300) throw new Error("Linkding never became healthy.");
  await new Promise((resolve) => setTimeout(resolve, 200));
}

http.createServer((request, response) => {
  if (request.url === "/confam-observations" && request.method === "GET") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ internalRequests, proxiedRequests })); return;
  }
  const upstream = http.request(`http://127.0.0.1:${free}${request.url}`, { method: request.method, headers: request.headers }, (reply) => {
    response.writeHead(reply.statusCode ?? 502, reply.headers); reply.pipe(response);
  });
  upstream.on("error", () => { response.statusCode = 502; response.end(); });
  request.pipe(upstream);
}).listen(port, "127.0.0.1");
