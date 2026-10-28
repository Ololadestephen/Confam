// Runs the salon app's own tests and the case reproductions against one app
// directory. Point SALON_APP_DIR at a patched copy to test a variant.

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = process.env.SALON_APP_DIR ?? path.join(here, 'app');
const port = Number(process.env.SALON_PORT ?? 4310);
const dbPath =
  process.env.SALON_DB_PATH ??
  path.join(os.tmpdir(), `confam-salon-${process.pid}-${Date.now()}.sqlite`);

export default defineConfig({
  testDir: here,
  testMatch: ['app/tests/**/*.spec.js', 'cases/**/*.spec.js'],
  outputDir: process.env.SALON_OUTPUT_DIR ?? path.join(os.tmpdir(), 'confam-salon-results'),
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server.js',
    cwd: appDir,
    url: `http://127.0.0.1:${port}/api/health`,
    env: { PORT: String(port), DB_PATH: dbPath },
    reuseExistingServer: false,
  },
});
