// Day 1 specimen check: the original app must fail the reproduction on [E1]
// while the existing smoke test passes, and both correct controls must pass
// everything. Oracle probes must agree. The Day 2 engine replaces this script.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookingCase, caseStartsAt } from '../cases/disappearing-booking/case.js';
import { probes } from '../probes/index.js';

const salonDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(salonDir, '../..');
const runDir = path.join(rootDir, 'runs', 'day1');
const config = path.join(salonDir, 'playwright.config.js');

const allProbes = (holds) => Object.fromEntries(Object.keys(probes).map((id) => [id, holds]));

const VARIANTS = [
  { name: 'original', patch: null, expected: { smoke: 'passed', repro: 'failed:E1', probes: allProbes(false) } },
  {
    name: 'control-a',
    patch: 'controls/control-a-server-parsing.patch',
    expected: { smoke: 'passed', repro: 'passed', probes: allProbes(true) },
  },
  {
    name: 'control-b',
    patch: 'controls/control-b-24h-slots-and-reload.patch',
    expected: { smoke: 'passed', repro: 'passed', probes: allProbes(true) },
  },
];

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function prepareVariant({ name, patch }) {
  const dir = path.join(runDir, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const appDir = path.join(dir, 'app');
  fs.cpSync(path.join(salonDir, 'app'), appDir, {
    recursive: true,
    filter: (source) => !source.includes('node_modules') && !source.endsWith('.sqlite'),
  });
  if (patch) {
    const git = (...args) => spawnSync('git', args, { cwd: appDir, encoding: 'utf8' });
    git('init', '-q');
    const applied = git('apply', path.join(salonDir, patch));
    if (applied.status !== 0) throw new Error(`${name}: patch did not apply\n${applied.stderr}`);
  }
  return { dir, appDir };
}

function runPlaywright({ appDir, dir }, filter, port, dbPath) {
  fs.rmSync(dbPath, { force: true });
  const result = spawnSync('npx', ['playwright', 'test', '-c', config, filter, '--reporter=json'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      SALON_APP_DIR: appDir,
      SALON_PORT: String(port),
      SALON_DB_PATH: dbPath,
      SALON_OUTPUT_DIR: path.join(dir, `results-${filter}`),
    },
  });
  const report = JSON.parse(result.stdout);
  const tests = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests) tests.push(t.results.at(-1));
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites) walk(suite);
  if (tests.length !== 1) return `error:expected 1 test, found ${tests.length}`;

  const [last] = tests;
  if (last.status === 'passed') return 'passed';
  const message = stripAnsi(last.error?.message ?? '');
  const tag = /\[(E\d+)\]/.exec(message);
  return tag ? `failed:${tag[1]}` : `failed:other (${message.split('\n')[0]})`;
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`App at ${baseUrl} did not become healthy`);
}

async function runProbes(appDir, port, dbPath) {
  const baseUrl = `http://127.0.0.1:${port}`;
  let server;
  const ctx = {
    dbPath,
    baseUrl,
    async restartApp() {
      server?.kill();
      server = spawn('node', ['server.js'], {
        cwd: appDir,
        env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
        stdio: 'ignore',
      });
      await waitForHealth(baseUrl);
    },
  };
  const subject = {
    customerPhone: bookingCase.customer.phone,
    service: bookingCase.service,
    startsAt: caseStartsAt(),
  };
  const outcomes = {};
  try {
    for (const [id, probe] of Object.entries(probes)) {
      outcomes[id] = (await probe.run(ctx, subject)).holds;
    }
  } finally {
    server?.kill();
  }
  return outcomes;
}

let failures = 0;
let port = 4320;
for (const variant of VARIANTS) {
  const paths = prepareVariant(variant);
  const smoke = runPlaywright(paths, 'smoke.spec', port++, path.join(paths.dir, 'smoke.sqlite'));
  const reproDb = path.join(paths.dir, 'repro.sqlite');
  const repro = runPlaywright(paths, 'repro.spec', port++, reproDb);
  const probeResults = await runProbes(paths.appDir, port++, reproDb);

  const actual = { smoke, repro, probes: probeResults };
  const ok = JSON.stringify(actual) === JSON.stringify(variant.expected);
  if (!ok) failures += 1;

  console.log(`\n${ok ? 'OK  ' : 'FAIL'} ${variant.name}`);
  console.log(`     smoke test: ${smoke}`);
  console.log(`     reproduction: ${repro}`);
  for (const [id, holds] of Object.entries(probeResults)) {
    console.log(`     probe ${id}: ${holds ? 'holds' : 'does not hold'}`);
  }
  if (!ok) console.log(`     expected: ${JSON.stringify(variant.expected)}`);
}

console.log(failures === 0 ? '\nAll variants behaved as expected.' : `\n${failures} variant(s) did not.`);
process.exit(failures === 0 ? 0 : 1);
