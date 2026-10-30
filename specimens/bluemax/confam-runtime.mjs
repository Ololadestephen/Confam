// Confam runtime wrapper for the Bluemax specimen. Runs inside each isolated variant copy.
// Bluemax runs on Supabase, so each variant uses the local Supabase stack in Docker (never the live
// project). Variants run one at a time: the first start of a variant resets the local database to
// that variant's own migrations; a Confam restart keeps the data and only cold-starts the edge
// functions, which is the condition the reported bug depends on.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.PORT);
const data = process.env.CONFAM_DATA;
if (!port || !data) throw new Error("PORT and CONFAM_DATA are required.");
const workdir = process.cwd();
const services = "studio,imgproxy,inbucket,realtime,logflare,vector,supavisor,postgres-meta,mailpit";
const supabase = (...args) => execFileSync("supabase", [...args, "--workdir", workdir], { stdio: ["ignore", "pipe", "inherit"] }).toString();
const api = "http://127.0.0.1:54321";

try {
  supabase("status");
} catch {
  // Another Bluemax revision may use a different local project ID on the same ports; stop it first.
  execFileSync("supabase", ["stop", "--all", "--yes"], { stdio: "ignore" });
  supabase("start", "-x", services);
}
const marker = path.join(path.dirname(data), "bluemax-database-ready");
if (!existsSync(marker)) {
  supabase("db", "reset", "--local", "--yes");
  writeFileSync(marker, "reset\n");
}

// Independent observations for reviewed probes: the wrapper, not the app, reads the database.
const projectId = /project_id\s*=\s*"([^"]+)"/.exec(readFileSync("supabase/config.toml", "utf8"))[1];
const container = `supabase_db_${projectId}`;
const observations = path.join(path.dirname(data), "observations.json");
const sql = (text) => execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-tAc", text]).toString().trim();
// The rate_limits table only exists once a variant's migrations create it.
const observe = () => {
  const hasRateLimits = sql("SELECT to_regclass('public.rate_limits') IS NOT NULL") === "t";
  const snapshot = {
    leads: Number(sql("SELECT count(*) FROM public.leads")),
    rateLimitRows: hasRateLimits ? Number(sql("SELECT count(*) FROM public.rate_limits")) : null,
  };
  writeFileSync(`${observations}.tmp`, JSON.stringify(snapshot));
  renameSync(`${observations}.tmp`, observations);
};
observe();
setInterval(() => { try { observe(); } catch { /* the next snapshot retries */ } }, 500);

// A Confam restart must be a real cold start: remove any edge runtime left by an earlier start, so
// the function's in-memory state does not carry over.
try { execFileSync("docker", ["rm", "-f", `supabase_edge_runtime_${projectId}`], { stdio: "ignore" }); } catch { /* none running */ }
const functions = spawn("supabase", ["functions", "serve", "--no-verify-jwt", "--workdir", workdir], { stdio: "inherit" });
const stop = () => { functions.kill("SIGINT"); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
functions.once("exit", (code) => { console.error(`supabase functions serve exited ${code}`); process.exit(1); });

// Warm the function with a CORS preflight, which returns before any rate limiting.
for (let attempt = 0; ; attempt += 1) {
  try {
    const response = await fetch(`${api}/functions/v1/submit-lead`, { method: "OPTIONS" });
    await response.body?.cancel();
    if (response.ok) break;
  } catch { /* still starting */ }
  if (attempt > 600) throw new Error("submit-lead never answered its preflight.");
  await new Promise((resolve) => setTimeout(resolve, 200));
}

http.createServer((request, response) => {
  if (request.url === "/confam-ready") { response.end("ready"); return; }
  // Test-only fault switch, served by this wrapper and never by Bluemax: makes the rate-limit table
  // unavailable to the function, as an outage or permissions mistake would. A variant's database reset undoes it.
  if (request.url === "/confam-fault/rate-limits-unavailable" && request.method === "POST") {
    try {
      sql("ALTER TABLE public.rate_limits RENAME TO rate_limits_unavailable");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ fault: "rate-limits-unavailable" }));
    } catch {
      response.statusCode = 409;
      response.end();
    }
    return;
  }
  const upstream = http.request(`${api}${request.url}`, { method: request.method, headers: { ...request.headers, host: "127.0.0.1:54321" } }, (reply) => {
    response.writeHead(reply.statusCode ?? 502, reply.headers);
    // Snapshot after each response and before passing it on, so probes never read a stale count.
    reply.pipe(response, { end: false });
    reply.on("end", () => {
      try { observe(); } catch { /* the interval retries */ }
      response.end();
    });
  });
  upstream.on("error", () => { response.statusCode = 502; response.end(); });
  request.pipe(upstream);
}).listen(port, "127.0.0.1");
