// Confam runtime wrapper for the Mosaic specimen. Runs inside each isolated variant copy.
// Gives the variant its own PostgreSQL cluster and Next.js dev server, warms the routes the
// workflow uses, and only then opens PORT, so Confam's readiness check means "ready to test".
import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const port = Number(process.env.PORT);
const data = process.env.CONFAM_DATA;
if (!port || !data) throw new Error("PORT and CONFAM_DATA are required.");

const deps = JSON.parse(readFileSync(".confam-deps.json", "utf8")).nodeModules;
if (!existsSync("node_modules")) symlinkSync(deps, "node_modules", "dir");

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer().once("error", reject).listen(0, "127.0.0.1", () => {
    const { port: free } = server.address();
    server.close(() => resolve(free));
  });
});
const children = [];
const run = (args, env) => {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: "inherit" });
  children.push(child);
  return child;
};
const finished = (child) => new Promise((resolve, reject) =>
  child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${child.spawnargs.join(" ")} exited ${code}`)))));

const { default: EmbeddedPostgres } = await import(path.resolve("node_modules/embedded-postgres/dist/index.js"));
const pgPort = await freePort();
const pg = new EmbeddedPostgres({
  databaseDir: path.join(data, "postgres"), user: "mosaic", password: "confam-local-only",
  port: pgPort, persistent: false, onLog: () => {}, onError: () => {},
});
await pg.initialise();
await pg.start();
await pg.createDatabase("mosaic");
const databaseUrl = `postgresql://mosaic:confam-local-only@127.0.0.1:${pgPort}/mosaic`;
await finished(run(["--import", "tsx", "scripts/migrate.ts"], { DATABASE_URL: databaseUrl }));

// Independent observations for reviewed probes: the wrapper, not the app, reads the database
// and writes a JSON snapshot next to the variant's data path.
const { default: postgres } = await import(path.resolve("node_modules/postgres/src/index.js"));
const observer = postgres(databaseUrl, { max: 1, onnotice: () => {} });
const observations = path.join(path.dirname(data), "observations.json");
const observe = async () => {
  const limits = await observer`SELECT key, attempts FROM rate_limits`;
  const sessions = await observer`SELECT u.email, count(s.token_hash)::int AS count FROM users u LEFT JOIN sessions s ON s.user_id = u.id GROUP BY u.email`;
  const snapshot = {
    rateLimits: Object.fromEntries(limits.map((row) => [row.key, row.attempts])),
    sessionsByEmail: Object.fromEntries(sessions.map((row) => [row.email, row.count])),
  };
  writeFileSync(`${observations}.tmp`, JSON.stringify(snapshot));
  renameSync(`${observations}.tmp`, observations);
};
await observe();
const observing = setInterval(() => { observe().catch(() => {}); }, 250);

const nextPort = await freePort();
run(["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(nextPort)], {
  DATABASE_URL: databaseUrl, APP_ORIGIN: `http://127.0.0.1:${port}`,
  ALLOW_REGISTRATION: "true", AI_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1",
});

const internal = `http://127.0.0.1:${nextPort}`;
for (const route of ["/api/health", "/login", "/app"]) {
  for (let attempt = 0; ; attempt += 1) {
    try { await fetch(internal + route, { redirect: "manual" }); break; }
    catch { if (attempt > 600) throw new Error(`Route ${route} never responded.`); await new Promise((r) => setTimeout(r, 200)); }
  }
}

const proxy = net.createServer((client) => {
  const upstream = net.connect(nextPort, "127.0.0.1");
  client.pipe(upstream).pipe(client);
  const close = () => { client.destroy(); upstream.destroy(); };
  client.on("error", close); upstream.on("error", close);
});
proxy.listen(port, "127.0.0.1");

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  proxy.close();
  clearInterval(observing);
  await observer.end().catch(() => {});
  for (const child of children) child.kill("SIGTERM");
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
