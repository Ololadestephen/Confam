# Confam engine

Confam verifies proposed repairs against reviewed behavioral expectations and records what its checks actually observe. The general verification path runs salon and task-board browser workflows and quote-tool HTTP workflows through the same executor. The legacy salon pipeline additionally challenges checks with deliberately faulty patches.

See the root [clean setup](../README.md), [release checks](RELEASE.md) and [measured prototype results](EVALUATION.md). The [general verification roadmap](ROADMAP.md) tracks implementation. TR1–TR3 project runtimes, general browser workflows, and reviewed decoy challenges are implemented. Genuine independent evaluation still requires an owner-prepared private pack.

## Local evidence review and recording intake (TR4)

Build the UI, then open the saved-run library (or select one existing run directory):

```sh
npm run web:build -w confam
npm run confam -- serve runs
# Or scope the server to a single run:
npm run confam -- serve runs/YOUR_RUN_DIRECTORY
```

Open the printed loopback URL, which contains a temporary access token. The evidence viewer supports general challenge/verification reports, legacy manifests, and recording intake. It shows original, challenge/control and candidate footage, confirmed requirements, actual assertions/probes, development counts, independent evaluation counts when recorded, limitations and version history. Videos have independent controls and step transcripts; workflow clocks are not assumed to match recording clocks. Saved metadata changes stream through SSE. Evidence pages never change historical expectations. Apps and the new-report builder can save local projects and reviewed drafts; confirmed drafts can also start explicitly approved browser verification jobs.

Collection mode lists at most 200 recognized candidate run directories directly under the selected root, omitting unreadable/invalid reports and symlinks; it never recurses into worktrees or evaluation packs. Each run has isolated artifact URLs and token-authenticated APIs. Deep links retain access tokens and support refresh.

Artifacts must be referenced by the selected report or its sealed checks bundle, remain inside that run directory, and pass regular-file/symlink checks. Known variant-adjacent runtime logs and candidate patches are supported for existing report formats. Evidence endpoints never expose a directory listing or the repository; onboarding source previews are restricted to the explicitly registered project configuration’s declared files. Export is a deliberate JSON summary with credential/personal-identifier redaction; recordings, traces, logs, source and local links are omitted. Redaction is best effort: review the summary before sharing. Raw local evidence may contain sensitive data.

Recording intake sends the supplied clip and written report to Meta. Review their contents and approve that export before invoking:

```sh
npm run confam -- recording-intake recording.mp4 --report report.md --budget 0.25
```

The supported slice accepts regular nonfragmented MP4 files up to 10MiB and 120 seconds with known video duration. It uses the shared token preflight and cost ledger, with no automatic retry. Observations/actions have bounded timestamps; suggested expectations remain unconfirmed. Unsupported/ambiguous media, model/API failures or budget limits preserve an explicit text fallback. This command never produces an execution verdict, confirms requirements or starts application verification. Review its proposal, then separately prepare and confirm a case/workflow for `verify`.

Local/fixture recording tests and real two-project browser evidence review are verified. On October 29, a scoped owner-approved live Spark call interpreted a 4.6-second fictional task-board recording: Todo → Completed with “Update confirmed” → Todo. The shared ledger recorded $0.008239 estimated spend under the $0.25 cap, with settled usage. A separate review checked the output against sampled frames; exact transition timestamps were not independently measured. This establishes one successful recording interpretation, not broad video accuracy or repair correctness. The model explicitly left click/reload methods uncertain and persistence expectations unconfirmed. The multipage interface now includes a landing page, searchable project/status-filtered library, local case-preparation wizard, recorded expectations, execution activity, verdict, comparison, challenge detail, check history and local summary preview. The advanced manual wizard downloads a case/report and safely quoted CLI command without model calls. The registered-app report builder additionally proposes editable requirements and workflows after explicit export approval; draft preparation changes no historical confirmations; execution is a separate approved job. Live activity follows saved metadata, not a browser screencast. Summary preview is local, with deliberate redacted JSON export; there is no hosted share link or synchronized playback. React Bits SpotlightCard and adapted FadeContent provide subtle local interactions; see [third-party notices](THIRD_PARTY_NOTICES.md).

## Report builder (ON3)

Open Apps, add the folder on the computer running Confam, and review its setup. A valid Confam configuration is required for model-assisted report authoring; framework detection alone does not supply isolated state or readiness settings. Describe the bug and optionally select an MP4. Case IDs are generated automatically.

Review the exact source/report/schema export before sending it to Meta. Text credentials receive best-effort redaction; recordings are sent whole and unredacted only with explicit consent. Edit the proposed expectations and test data, answer clarification questions, and choose which expectation represents the reported failure. Review a second export to propose the workflow. Both requests share a $0.25 ledger; uncertain usage stops further calls. A failed request can explicitly prepare a fresh export for approval without resetting that ledger. There are no automatic model retries.

Review and edit the workflow. Validation failures remain visible and must be corrected before confirmation saves local case/report/workflow files and a CLI command. Source changes invalidate the draft. Saved proposals, export payloads, failed attempts and usage are local private state under the library's `.onboarding/`; they are not shared or deployed. Exclusive disk locks prevent concurrent sends; interrupted locks require a new report. The manual setup path remains available without model export.

One owner-approved live text test on the fictional quote tool cost an estimated $0.01825025. The generated workflow required two manual corrections before the real CLI reproduced the original defect and passed the existing repair. This establishes a bounded review workflow, not autonomous correctness or unfamiliar-project compatibility. Browser execution jobs are available for confirmed drafts; see ON4 below.

## Verification jobs (ON4)

From a confirmed draft, select **Prepare verification**. Optionally upload a `.patch` or `.diff` up to 1MiB. Review the actual command, expectations, workflow, test data, source manifest and patch, then approve the frozen snapshot and start. Preparing a preview never launches the application or calls a model.

The job uses the same ordinary-verification engine as the CLI. Source, configuration, confirmation, report, workflow and candidate contents are checked again before launching a worker. Source changes require a new preview. The snapshot includes regular runtime files and executable mode, bounded to 2,000 files and 20MiB; dependency/build/cache directories, private planning files, environment files and runtime databases are excluded. Symlinks and nonregular entries are rejected. Dependencies/install/build hooks remain unsupported.

Only one job runs per local registry. Progress records actual phases and steps rather than a simulated percentage. Reloading the page resumes observation without restarting execution. Cancel waits for runtime and browser cleanup; cancelled/interrupted runs have no completed candidate verdict. Server shutdown or loss interrupts the worker. Unconfirmed cleanup retains the execution lock and blocks another run; do not assume resources were stopped when the job says cleanup is unconfirmed. Only the worker's owning server can request cancellation. Jobs never resume automatically, and no model calls occur during execution.

Finished jobs link to the existing run evidence. Browser execution is enabled when `serve` opens a run library, rather than a single historical run directory. Runtime isolation is not containment for hostile code. Local snapshots and worker records are private generated state; no public upload occurs.

## Project runtime checks (TR1)

A reviewed project configuration supplies the application root, editable source files, command argv, working directory, readiness path, port/state environment bindings, timeout, and restart capability. See `specimens/salon/project.json` for a working example. Paths are relative to the configuration file; use `root: "."` when configuration lives inside the application root. Source paths are relative to that root. Commands execute directly without shell interpolation.

```sh
npm run confam -- project-check specimens/salon/project.json
```

This command snapshots the project, creates a disposable worktree and owned data directory, starts the configured process, exercises restart when supported, stops it, and resets its data. Its report establishes runtime readiness only. It does not verify a bug or repair. Startup failures exit nonzero with runtime logs under the generated run directory.

New baselines commit `.confam-project.json` alongside the application snapshot. Patch guards use its configured source list, reject protected dependency/test/configuration files and mode changes, and refuse missing or modified tracked snapshots. Historical baselines without a committed snapshot use the explicit salon compatibility adapter. Existing salon commands remain available through the compatibility adapter.

Dependencies must already be resolvable from the disposable runtime. This release does not install dependencies, copy the source repository’s node_modules, or run a separate build hook; external projects whose dependencies are available only in their original checkout are not yet supported. Commands requiring additional inherited environment variables, external services, or seed/reset hooks are unsupported. Child applications receive only PATH and the configured port/state bindings. The state binding is a path inside variant-owned storage; restart preserves it and reset removes that storage only after shutdown. Local tests validate macOS/POSIX process-group cleanup; Windows descendant cleanup is not supported. This is not containment for hostile code.

## General behavioral verification (TR2)

A case defines its project ID, report, fixture values, expectation IDs/statements, designated reproduction targets, optional correct controls, and verification mode. Report and control paths resolve inside the case directory. A separate declarative workflow supplies actions and assertions. New applications use these files and project configuration; they do not require a new browser runner.

The included examples use explicitly labelled fixture inputs and scripted expectation confirmation. They execute real processes and Chromium, with no model calls:

```sh
npm run confam -- verify specimens/task-board/case.json --project specimens/task-board/project.json --workflow specimens/task-board/workflow.json --fixture --candidate specimens/task-board/control-a.patch
npm run confam -- verify specimens/salon/cases/generic-persistence/case.json --project specimens/salon/project.json --workflow specimens/salon/cases/generic-persistence/workflow.json --fixture --candidate specimens/salon/cases/generic-persistence/control-a.patch
```

For ordinary verification, `specimens/task-board/case-verify.json` demonstrates running without prewritten correct repairs. The report explicitly states that false-rejection calibration is unavailable. Benchmark mode requires two distinct reviewed correct controls, and every supplied control must pass. To see a rejected repair, use `specimens/task-board/wrong-candidate.patch`; the command exits nonzero after the persistence assertion fails.

For your own case, review the expectations, fixtures, and workflow, then pass `--accept` instead of `--fixture`. That confirmation is specific to the current case and workflow. Scripted confirmation is accepted only for a case whose `purpose` is explicitly `fixture`.

Workflows support navigation, forms, select by value/label, bounded waits, reload/reopen, named independent browser contexts, restart when configured, same-origin HTTP requests, typed captures, and assertions. Every assertion references a listed expectation. Actual values must come from captures; expected values are literals or confirmed fixture references. No model-generated JavaScript or shell command is executed. Unsupported actions, forward references, prototype references, and unsupported runtime capabilities are rejected before evaluation.

Each run archives an immutable checks bundle, confirmation, original report, fixtures, project configuration, control patches, baseline revision, and workflow executor identity. Hashes and baseline integrity are checked before/after execution and restart. The original must fail on a designated reproduction assertion; timeouts and selector errors cannot satisfy that gate. Correct controls gate candidate evaluation. Candidate execution errors remain incomplete verification, distinct from observed assertion failures.

Results are written to `runs/verify-*/verification.json` with per-variant trace/video evidence. A passing candidate means it passed the listed checks under those conditions. TR2 does not establish independent decoy strength or application-wide correctness. Preserve the original project/case configuration to replay the archived `checks/workflow.json` through the same `verify` command. Recordings supplied to verification remain unprocessed; use the separate review-only recording intake below.

### Model workflow proposals

```sh
npm run confam -- draft-workflow path/to/case.json --project path/to/project.json --budget 0.25
```

This live command sends the report, listed expectations, fixtures, supported capabilities, and configured source files to Meta. Review that source scope before using it. It uses the shared token/cost ledger and cap, saves a proposal under `runs/workflow-draft-*/`, and neither confirms expectations nor executes the application. Review the proposal, then supply its workflow path to `verify`. The generic proposal path has been tested with an injected fixture transport; it has not yet been verified in a live Meta call. The existing salon authoring path has separate live evidence.

## General challenges and comparison (TR3)

A reviewed development manifest defines independent probes, faulty patch proposals, their correct reference control, expectation mappings, and required observations. Faults are applied to a control that passed the workflow and probes, rather than accidentally inheriting an unrelated original defect.

```sh
npm run confam -- challenge specimens/task-board/case.json --project specimens/task-board/project.json --workflow specimens/task-board/workflow.json --manifest specimens/task-board/challenges.json --fixture --candidate specimens/task-board/control-a.patch
npm run confam -- challenge specimens/salon/cases/generic-persistence/case.json --project specimens/salon/project.json --workflow specimens/salon/cases/generic-persistence/workflow.json --manifest specimens/salon/cases/generic-persistence/challenges.json --fixture --candidate specimens/salon/cases/generic-persistence/control-a.patch
```

These examples use one deliberately restored persistence defect per application, with scripted input confirmation and real browser/probe execution. They are development fixtures, not independent evidence or new model-generated faults.

Supported reviewed observations are bounded JSON files inside variant storage, parameterized read-only SQLite SELECTs, and same-origin HTTP JSON GETs. Probe definitions never come from a model response. HTTP observations have a deadline and size limit; synchronous SQLite queries require trusted review and are not a hostile-query sandbox.

A decoy counts as caught/survived only after the workflow reaches its trigger, the independent requirements confirm the declared violation, and execution completes. Detection must fail an assertion mapped to the declared expectation. Unrelated assertions, unavailable observations, startup failure, timeouts and unreached workflows stay outside caught/survived counts. Probe errors cannot qualify as negative observations. A passing check with a confirmed fault is a survivor and an oracle-only detection; the oracle does not earn the check detection credit.

Human review must establish that the requirements logically support the fault description. For example, wrong ownership needs both a saved row and incorrect ownership; a missing row alone does not establish that fault. Review the case, workflow, source policy, registry and decoy requirements before using `--accept` on a non-scripted run. A model's declaration alone is insufficient.

Every version reruns the original and all supplied controls. At most two strengthening rounds preserve the complete existing workflow as an unchanged prefix and append checks under already agreed expectation IDs. Alterations/removals, new expectation IDs, and invalid proposals stop for review. Histories and proposals are archived. Without survivors there are zero rounds. Optional `--strengthen --budget 0.25` uses a stateless Spark verifier through the shared client/ledger, sending only current workflow and surviving development evidence to Meta; it requires developer confirmation and cannot be combined with `--fixture`. No live strengthening call was needed in the included runs.

### Review-only decoy drafting

```sh
npm run confam -- draft-decoys specimens/task-board/case.json --project specimens/task-board/project.json --registry specimens/task-board/reviewed-probes.json --reference control-a --budget 0.25
```

This exports the report, expectations, fixtures, reviewed probes and corrected reference source to Meta. It drafts unified diffs, validates references and source boundaries, and checks applicability. It saves a review-only development manifest and ledger under `runs/draft-decoys-*/`, and executes no application. Review the proposals and requirements before supplying the manifest to `challenge`. Generic decoy drafting and strengthening have been tested with injected fixture transports; their live API integration is not yet verified.

### Post-freeze comparison

The final seal includes workflows, confirmed requirements, fixtures, project configuration, reviewed probes, patch contents, baseline revision, Node version, dependency manifest identity and trusted engine source identity. Checks and identities are verified around execution. If trusted code or dependencies change, use the original implementation for that sealed run or create a new freeze before revealing a fresh private pack.

After replacing `CHALLENGE_RUN_DIRECTORY` with the completed run's directory:

```sh
npm run confam -- compare CHALLENGE_RUN_DIRECTORY --pack specimens/task-board/integration-pack.json --integration-fixture
```

The included integration pack deliberately reuses the known development fault. It exercises the comparison command and **never** promotes the main report's independent-evaluation status. Genuine evaluation uses an explicit owner-provided `--pack` without the fixture flag, only after freeze and with developer-confirmed inputs. It makes no model calls. One attempt is allowed per frozen run, even if it fails; a genuinely consumed pack digest cannot be reused across other runs in the same runs directory. Scripted fixture sessions cannot receive genuine independent-evaluation claims. Never provide private packs to development or strengthening commands.

Optional manifest comparator roles `existing` and `direct-ai` reference already prepared workflow files. All arms are frozen before the pack is read. The final workflow and independent probes qualify each fault once; every arm then receives the same label, and only its own assertions score detection. Correct-control false rejections and execution errors remain visible; weak comparison arms are never discarded or repaired after evaluation. Missing roles are explicitly absent. No existing/direct-AI comparison was supplied in the example runs.

Comparator provenance can include `modelId`, `modelVersion`, `prompt`, `inputHash`, `budgetUsd` and `authoringMs` (nullable when unknown). Supplied labels/metadata remain unverified and cannot establish an AI-performance claim by themselves. Comparison reports record raw counts, qualification, control failures, timings and evidence, with progress checkpoints on interruption. No percentage or superiority claim is justified by the tiny included fixture set.

## Legacy salon challenge pipeline

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

Use Node 22.13 or newer, installed workspace dependencies, and Playwright Chromium. Candidate paths are relative to the current working directory. The legacy run/intake/execute/demo commands support the included disappearing-booking case; general verification uses the separate verify command.

Each evaluation writes `runs/<id>/manifest.json`, evaluated patches, checks versions, a disposable baseline Git repository, and separate variant worktrees. Live sessions also retain intake, confirmation, check declarations, the decoy draft, and `model-usage.json`. Each version keeps its original/control/decoy results. Each variant gets its own database, server port, browser contexts, videos, trace, and server log. Restarts stop the old server before starting a new one against the same database. One session can evaluate once; stopped or completed sessions cannot silently rerun and spend again.

Strengthening runs only when an oracle-confirmed development decoy survives. A separate stateless Spark verifier receives the confirmed expectations, current declarations, and surviving development patches and observations. It never receives caught decoys or held-out data. At most two strengthening rounds produce `v2` and `v3`; every version must reproduce E1 on the original and pass both correct controls. Existing declarations must remain unchanged. A proposed alteration or removal stops the run in `needs-review`, preserves the proposal, and prevents final freeze. The current compiler supports extra fresh-sign-in and other-customer-reopen observations under existing expectations. If no supported strengthening is possible, remaining survivors are reported honestly.

When development finishes, `final-freeze.json` records the final checks hash and baseline revision. Existing versions and seals cannot be overwritten. The manifest contains a plain-language `client` verdict plus developer evidence; a passing candidate stays `provisional` while independent evaluation is incomplete. Genuine held-out results are evaluated by a separate no-model command and never enter development prompts. See [the private pack format](HELDOUT.md) before preparing the independent set.

The original must fail specifically on E1, and both controls must pass the frozen checks and oracle probes, before decoys or a candidate are evaluated. A decoy is counted only after reaching confirmation and satisfying its curated oracle requirements. Startup failures, unreached workflows, execution errors, timeouts, and unconfirmed violations stay outside caught/survived counts. T3 requires both a saved row and wrong ownership. T4 also requires a recorded database write error; its missing-row probe alone does not establish that cause.

Candidate patches are restricted to existing salon application source files. Dependency manifests, tests, probes, checks, infrastructure, and mode changes are rejected. A candidate passes only when its browser checks and all candidate oracle observations agree. Exit status is nonzero for a blocked/error/budget-stopped run or a candidate that does not pass; development-decoy outcomes are reported separately.

All model generations use a shared client with automatic retries disabled. Before generation it counts the rendered input and reserves uncached input cost plus the full output limit. The default cap is $0.25, chosen conservatively after the first salon run measured about $0.026 in estimated token cost. A request that cannot fit stops before generation. Missing usage or a network failure retains the reservation and stops further calls; reported provider overruns are recorded explicitly. Usage-derived dollar figures are estimates using the dated [Meta Standard-mode rates](https://dev.meta.ai/docs/pricing-rate-limits), rather than an invoice reconciliation. No hosted model tools are enabled. Token preflight follows Meta's [Responses token-counting endpoint](https://dev.meta.ai/docs/token-counting).

Variants run as local processes. Worktrees and separate databases isolate experiments, but do not safely contain hostile code. Review candidate source before running it. Genuine held-out evaluation still requires an independently prepared private pack. A separate local evidence viewer and review-only recording intake are available; one short fictional task-board MP4 has been interpreted successfully in a live API test. The baseline `run` command checks E1/E2 and observes restart via an oracle; authored sessions can additionally confirm and check E3/E4.
