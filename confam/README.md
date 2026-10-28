# Confam engine

Confam challenges a repair with deliberately faulty patches and records what the checks actually catch. The current slice supports one salon case through a deterministic baseline or a live Muse Spark authoring flow.

From the repository root:

```sh
npm run confam -- run specimens/salon/cases/disappearing-booking
npm run confam -- run specimens/salon/cases/disappearing-booking --candidate specimens/salon/controls/control-a-server-parsing.patch
npm test
npm run typecheck
```

For live authoring, the owner supplies `MODEL_API_KEY` in the root `.env`. Intake sends the fictional report to Meta; later authoring sends the confirmed expectations and supported salon application source. The key is never stored in run artifacts or passed to variant servers.

```sh
npm run confam -- intake specimens/salon/cases/disappearing-booking --budget 0.25
# Read the emitted session's intake.json, then use its actual session ID:
npm run confam -- confirm SESSION_ID --accept --answer yes
npm run confam -- execute SESSION_ID --candidate specimens/salon/controls/control-a-server-parsing.patch
```

Use `--fix` instead of `--candidate` to let Muse Wonder propose a focused app-only unified diff. The fixer receives the original application and confirmed expectations, never decoy or held-out results. Confam applies the protected-path guard and evaluates the patch independently.

To repeat a completed run using its unchanged, hash-checked confirmation in a fresh run directory and cost ledger:

```sh
npm run confam -- recheck COMPLETED_SESSION_ID --fix --budget 0.25
```

The parent run is preserved. This does not silently approve new expectations or rerun a stopped session.

Confirmation is explicit and hash-recorded. Answer `yes` to include restart survival (E4), or `no` to omit it. Checks must cover every confirmed expectation exactly once with the supported observation and expected count. The compiler uses the trusted salon workflow; models produce declarations rather than executable test code. Frozen hashes cover the workflow, subject, and compiled declarations.

Intake, check drafting, and development-decoy authoring use Muse Spark. T1 and T3 use model-authored exact source edits; T4 uses the existing curated failing-insert mutation so a model cannot establish a failed write just by printing an error. Reports distinguish `model-edits` from `curated-mutation`. No model writes an oracle probe or reports an execution result. Decoy authoring runs only after the original and both controls satisfy the reproduction/control gates.

An offline demonstration is available without credentials:

```sh
npm run confam -- demo specimens/salon/cases/disappearing-booking
```

The demo prominently labels its scripted model responses and confirmation. Its token/cost figures are simulated, and its API spend is zero. It uses the real browser runner, variant worktrees, probes, and patch compiler. Live failures never silently fall back to fixtures.

Use Node 22.13 or newer, installed workspace dependencies, and Playwright Chromium. Candidate paths are relative to the current working directory. This CLI currently supports only the included disappearing-booking case.

Each evaluation writes `runs/<id>/manifest.json`, evaluated patches, checks versions, a disposable baseline Git repository, and separate variant worktrees. Live sessions also retain intake, confirmation, check declarations, the decoy draft, and `model-usage.json`. Each version keeps its original/control/decoy results. Each variant gets its own database, server port, browser contexts, videos, trace, and server log. Restarts stop the old server before starting a new one against the same database. One session can evaluate once; stopped or completed sessions cannot silently rerun and spend again.

Strengthening runs only when an oracle-confirmed development decoy survives. A separate stateless Spark verifier receives the confirmed expectations, current declarations, and surviving development patches and observations. It never receives caught decoys or held-out data. At most two strengthening rounds produce `v2` and `v3`; every version must reproduce E1 on the original and pass both correct controls. Existing declarations must remain unchanged. A proposed alteration or removal stops the run in `needs-review`, preserves the proposal, and prevents final freeze. The current compiler supports extra fresh-sign-in and other-customer-reopen observations under existing expectations. If no supported strengthening is possible, remaining survivors are reported honestly.

When development finishes, `final-freeze.json` records the final checks hash and baseline revision. Existing versions and seals cannot be overwritten. The manifest contains a plain-language `client` verdict plus developer evidence; a passing candidate stays `provisional` while independent evaluation is incomplete. Genuine held-out results are evaluated by a separate no-model command and never enter development prompts. See [the private pack format](HELDOUT.md) before preparing the independent set.

The original must fail specifically on E1, and both controls must pass the frozen checks and oracle probes, before decoys or a candidate are evaluated. A decoy is counted only after reaching confirmation and satisfying its curated oracle requirements. Startup failures, unreached workflows, execution errors, timeouts, and unconfirmed violations stay outside caught/survived counts. T3 requires both a saved row and wrong ownership. T4 also requires a recorded database write error; its missing-row probe alone does not establish that cause.

Candidate patches are restricted to existing salon application source files. Dependency manifests, tests, probes, checks, infrastructure, and mode changes are rejected. A candidate passes only when its browser checks and all candidate oracle observations agree. Exit status is nonzero for a blocked/error/budget-stopped run or a candidate that does not pass; development-decoy outcomes are reported separately.

All model generations use a shared client with automatic retries disabled. Before generation it counts the rendered input and reserves uncached input cost plus the full output limit. The default cap is $0.25, chosen conservatively after the first salon run measured about $0.026 in estimated token cost. A request that cannot fit stops before generation. Missing usage or a network failure retains the reservation and stops further calls; reported provider overruns are recorded explicitly. Usage-derived dollar figures are estimates using the dated [Meta Standard-mode rates](https://dev.meta.ai/docs/pricing-rate-limits), rather than an invoice reconciliation. No hosted model tools are enabled. Token preflight follows Meta's [Responses token-counting endpoint](https://dev.meta.ai/docs/token-counting).

Variants run as local processes. Worktrees and separate databases isolate experiments, but do not safely contain hostile code. Review candidate source before running it. Genuine held-out evaluation still requires an independently prepared private pack. There is no video intake or review UI yet. The baseline `run` command checks E1/E2 and observes restart via an oracle; authored sessions can additionally confirm and check E3/E4.
