# Local release verification

This release is distributed as a source checkout with its lockfile and specimen fixtures. The workspace package has no standalone CLI binary; `npm pack` is not the supported installation path. No hosted service or public deployment is provided.

## Prerequisites and clean setup

Use Node 24 LTS, npm and Git on a Playwright-supported host. Node 22.13+ on the 22 line is also within the declared project and test-runner requirements. The clean-source release checks passed on macOS with Node 24.22.1/npm 11.10.1: locked installation, Chromium setup, 216 tests, typecheck, production UI build, all four successful-candidate examples and the three expected nonzero outcomes below. An earlier Node 25.7.0 run also passed, but Node 25 is outside Vitest 5's declared support range.

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run web:build -w confam
```

Playwright may need separately installed operating-system browser dependencies on Linux. Browser downloads need network access unless already cached. No model API credentials are needed for the commands below. The clean-source verification used a staged Git-tree archive with fresh `node_modules`, excluding the owner's private plans, `.env`, previous runs, quality-tool state and private evaluation packs. It reused the existing host/browser cache and system dependencies; a fresh operating-system installation and Linux/Windows were not tested.

## Reproduce the ordinary verification results

From the repository root:

```sh
npm run confam -- verify specimens/task-board/case-verify.json --project specimens/task-board/project.json --workflow specimens/task-board/workflow.json --fixture --candidate specimens/task-board/control-a.patch
npm run confam -- verify specimens/salon/cases/generic-persistence/case-verify.json --project specimens/salon/project.json --workflow specimens/salon/cases/generic-persistence/workflow.json --fixture --candidate specimens/salon/cases/generic-persistence/control-a.patch
npm run confam -- verify specimens/quote-tool/case-quantity.json --project specimens/quote-tool/project.json --workflow specimens/quote-tool/workflow-quantity.json --fixture --candidate specimens/quote-tool/patches/good.patch
npm run confam -- verify specimens/quote-tool/case-invalid.json --project specimens/quote-tool/project.json --workflow specimens/quote-tool/workflow-invalid.json --fixture --candidate specimens/quote-tool/patches/good.patch
```

Each original should fail its designated assertion and each candidate should pass. These are scripted sample confirmations executed against real local applications. The quote workflows use HTTP observations; their browser video is not useful application footage. Missing correct controls and independent fault qualification remain explicit.

The incomplete candidate repairs recalculation but still accepts negative quantities. It passes the quantity case. The invalid-input case below should exit 1 after an observed candidate assertion failure:

```sh
npm run confam -- verify specimens/quote-tool/case-invalid.json --project specimens/quote-tool/project.json --workflow specimens/quote-tool/workflow-invalid.json --fixture --candidate specimens/quote-tool/patches/faulty.patch
```

These two constructed exercises also exit 1. The first passes the original assertion and blocks candidate evaluation because no reported failure was reproduced. The second rejects restart before execution because configuration declares that capability unavailable:

```sh
npm run confam -- verify specimens/quote-tool/case-nonreproduction.json --project specimens/quote-tool/project.json --workflow specimens/quote-tool/workflow-nonreproduction.json --fixture --candidate specimens/quote-tool/patches/good.patch
npm run confam -- verify specimens/quote-tool/case-nonreproduction.json --project specimens/quote-tool/project.json --workflow specimens/quote-tool/workflow-unsupported.json --fixture
```

Inspect the printed `verification.json` and its variant assertions, trace and limitations. Use `npm run confam -- serve runs/YOUR_RUN_DIRECTORY` after building the UI. The viewer is read-only and loopback-only, with a temporary token in its printed URL. Sharing that URL grants local evidence access to anyone who can reach that loopback server. Summary redaction is best effort; review exports before sharing.

## Challenge and evaluation boundaries

The [usage guide](README.md) documents development challenge and frozen comparison commands. `--integration-fixture` deliberately reuses a known development fault; it must never be called independent evaluation. No private pack was supplied for this release, no independent performance has been measured, and no direct-AI comparator result is available. Existing/direct-AI comparator arms stay absent.

The engine remained unchanged during the new quote fixture transfer. This establishes a configuration transfer to a freshly authored synthetic HTTP fixture, not external repository transfer or user onboarding success. Runtime dependency installation/build hooks, extra inherited environment variables and hostile-code containment remain unsupported. Broader browser/platform coverage is untested.

Demo recording is deferred at the owner's request. Submission form requirements, final submission and developer outreach remain separate owner actions; no messages, pushes, uploads or submissions were performed as part of this release check.
