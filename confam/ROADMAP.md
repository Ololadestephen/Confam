# Confam: general repair verification

Revised October 28, 2026. TR1 project runtimes and TR2 general behavioral workflows are implemented and verified on the salon and task-board specimens. TR3–TR5 remain planned. Generic model workflow proposals are fixture-tested; their live API integration remains unverified.

## 1. Product and users

Confam helps developers determine whether a proposed repair fixes a reported behavior and whether their checks would reject plausible wrong repairs.

Input: a local application repository, a bug report, optional recording, and a candidate patch or request for a fix. Output: a reproducible check, observed candidate results, challenges to the checks, and an evidence report with explicit limitations.

First users: freelancers, small agencies, and small software teams maintaining web applications with coding agents. Their clients can read the evidence without operating the tool. Initial value hypotheses are less manual retesting, fewer reopened bugs, and clearer repair handoffs. These require user validation.

The product must work across applications through configuration and reusable capabilities. Booking terminology, customer fields, CSS selectors, database tables, and specific failure categories belong to cases, never the engine.

## 2. Scope and what general means

The first release supports local web applications that can start through a configured command, expose a readiness check, use isolated test data, and be exercised in Chromium. Start with validated Node-based projects; the process interface must not assume Node or SQLite. Other runtimes become supported only after actual validation.

Supported behaviors include persistence, account separation, calculations, validation, and state transitions, expressed through the same browser/HTTP/assertion primitives. These are examples, not an enum restricting possible business domains.

Acceptance definition: register and run a second, structurally different application by adding configuration, fixtures, and optional reviewed probes, without modifying the engine, adding a domain branch, or writing a new bespoke browser runner. A third application tests transfer further.

General does not mean automatic support for every repository. Native mobile apps, arbitrary distributed infrastructure, real payment systems, production mutation, and execution of hostile public repositories are outside this release. A URL alone permits observation but cannot support controlled repair evaluation without source and a resettable runtime.

## 3. User journey

1. Select a local repository. Confam proposes a project configuration from available files; the developer reviews commands, source scope, data reset, and model-bound files.
2. Supply a report and optional recording. Spark extracts actions, observed behavior, expected behavior, and ambiguities with provenance.
3. Confirm expectations and meaningful test inputs. A recording shows what happened, not necessarily what should have happened. Ask a focused question when that distinction changes the test.
4. Compile a bounded action plan into an executable workflow. Reproduce the reported failure on the original application. Save trace, video, observations, and assertion identity.
5. Obtain a supplied patch, or optionally request a Wonder fix. The fixer returns application changes only; keep candidate outcomes out of check authoring.
6. Challenge and, where justified, strengthen the checks using qualified development faults. Freeze the final version. Without suitable independent probes, freeze the ordinary verification checks and disclose missing challenge evidence.
7. Evaluate the candidate against that final frozen version. Any earlier exploratory candidate result is version-labelled and cannot substitute for this evaluation or feed strengthening.
8. Read a concise verdict and expand the evidence. Export a runnable regression check and a local report after reviewing sensitive content.

Proposed commands, not yet implemented:

```text
confam init <repository>
confam verify --project <config> --report <file> [--recording <file>] [--candidate <patch> | --fix]
confam benchmark --suite <manifest>
confam report <run-id>
```

Preserve existing commands during migration. Do not silently reinterpret old confirmations or manifests.

## 4. Separate ordinary verification from benchmark evaluation

| Mode | Required inputs | Permitted conclusion |
|---|---|---|
| Verification | Runnable project, confirmed expectations, reproducible failure, frozen checks; patch for a candidate result | Candidate passed or failed the listed checks under the recorded conditions |
| Verification with challenges | Verification inputs plus reviewed independent probes for declared faults | Above, plus raw validated development-decoy outcomes; no independent-strength claim |
| Benchmark | Two independently written correct controls per case, curated probes, frozen comparator suites, independent evaluation pack | Results on that benchmark, including false rejections and unseen faults |

Every available control must pass before a Confam-authored check version is accepted. Benchmark mode requires both controls and blocks acceptance if either fails. Ordinary verification can proceed without prewritten correct repairs, but must say that false-rejection calibration is unavailable. A model-generated candidate is never relabelled an independently correct control. Comparator suites are measured independently: their control failures remain false-rejection results, never grounds for discarding that comparison arm.

Absence of probes does not prevent browser verification; it prevents claiming that a decoy was independently confirmed wrong. Such decoys stay unconfirmed. No held-out pack means independent evaluation was not performed. Missing evidence cannot be converted into a green confidence badge.

These are explicit new product rules. Legacy benchmark runs retain their existing stricter gates and provisional verdict semantics.

## 5. Architecture and contracts

### Project configuration and lifecycle

Introduce a versioned, runtime-validated ProjectConfig. It declares project root, source inclusion rules, protected paths, build/start argv, working directory, readiness method, environment variable names, fixtures/reset procedure, timeouts, and capabilities such as restart. Store secret references, never values.

Commands are explicit argument arrays with bounded process lifecycles. A reusable local-process adapter supplies prepare, build, start, ready, reset, restart, and stop. It owns per-variant ports and data directories, handles child-process cleanup, and checks capabilities before authoring. Hooks are developer-reviewed executable configuration, not model authority.

Dependencies are prepared explicitly. Variants must not share writable application state. Record dependency/runtime versions; do not allow candidate patches to modify lockfiles or installation commands in this first release. Unsupported runtime/data requirements produce an actionable result.

### Cases and expectations

Replace BookingSubject with versioned case data validated against the project's fixture schema. Replace fixed E1–E4 meanings with case-local stable IDs, statements, provenance, scope, and independently declared reproduction targets. IDs have no built-in business meaning.

A CaseDefinition references the report, optional recording, fixtures, expected behavior, optional controls, probe bindings, and development categories. Paths resolve within approved roots; reject traversal, symlink escapes, reserved IDs, and collisions.

The reproduction gate must observe a failing assertion explicitly designated as representing the reported bug. A timeout, unavailable selector, unrelated error, or another failing assertion does not qualify. Fixtures and clocks must be reproducible.

### Workflow compiler

Use a small versioned declarative action language compiled/executed by trusted code. Initial primitives: navigate, click, fill, select, bounded wait, reload, reopen page, create/switch browser context, same-project HTTP request, capture typed value, and restart when supported.

Assertions reference confirmed expectation IDs and support typed equality, count, visibility, text, and numeric comparisons. Locators prefer role/label/test ID; case-specific CSS is permitted and recorded. Variables use validated references rather than executable expression strings. No arbitrary JavaScript evaluation or shell commands in model plans.

Model output may choose steps and locators from bounded repository/browser context. It cannot define assertion success, invent observed values, or modify executor code. Every confirmed expectation must map to an executable assertion or an explicit unsupported result. A valid schema alone does not establish that a plan checks the right behavior; preserve the plan for review and use reproduction/control gates.

An unsupported action stops with an explanation. Adding a new capability requires a generic primitive and boundary tests, not a branch for one application. Export checks through the same compiler so the exported artifact preserves execution semantics.

### Independent observations and decoys

Use a ProbeRegistry with stable IDs, typed inputs/results, prerequisites, provenance, and a reviewed implementation digest. Provide generic HTTP and SQLite observation adapters where useful; allow developer-reviewed custom modules. No model writes or approves its own independent oracle during the run.

Decoy proposals use project-scoped source paths, declared expectation violations, and existing probe references. Remove the fixed three-category quota and five-file allowlist. Restrict edits to declared application sources; tests, probes, configuration, dependencies, runner, and evidence remain protected. Adding a new source file requires explicit supported policy rather than implicit permission.

Each decoy records its exact base revision and provenance. Prefer mutation of a known-correct benchmark reference so an unrelated original defect cannot explain its detection. Without a known-correct reference, record that limitation and validate the declared violation; do not treat the candidate itself as established truth.

Build/start, workflow reachability, independent fault confirmation, and check outcome remain distinct. Count a fault as caught only when a mapped assertion detects its declared violation; an unrelated assertion failure is reported separately. Keep invalid, unreached, timeout, execution-error, and unconfirmed results outside caught/survived counts.

### Versioning, independence, and verdicts

Preserve the bounded strengthening loop: at most two rounds, survivor-only development feedback, immutable history, and review for changing/removing expectations. A new project cannot inherit the salon owner's E1–E4 confirmation.

Freeze the workflow, assertions, fixtures, expectation confirmation, configuration, probe implementations, compiler/runtime identity, source baseline, and relevant dependency identity. Verify these inputs before execution and record supported migrations. Freeze excludes the intentional variant diff, which has its own digest. Changes invalidate reuse; old runs remain readable and are never silently upgraded.

The fixer receives the report, confirmed expectations, and approved application context. It cannot read final checks, private evaluation data, or modify verification infrastructure. Execution outcomes and verdict rules remain deterministic.

Report separate dimensions: reproduction, candidate outcome, control calibration, development challenges, independent evaluation, and limitations. Suggested top-level language: report not reproduced; candidate failed; candidate passed listed checks; verification incomplete. Include cost/time and a concise scope sentence. Never say the app is proven correct or universally safe to ship.

### Module boundaries

| Area | Responsibility |
|---|---|
| `src/project/` | Configuration, capability discovery, source policy, lifecycle adapters |
| `src/workflows/` | Plan schema, validation, compiler, browser/HTTP execution |
| `src/engine/` | Variant scheduling, gates, classification, freeze, reports |
| `src/probes/` | Reviewed observation contracts/adapters |
| `src/authoring/` | Generic intake, check/decoy prompts, bounded strengthening |
| `src/models/` | Existing shared client, model routing, token/cost ledger |
| `src/cli/` | Onboarding, verify, benchmark, report commands |
| `src/web/` | Local report UI and run progress |
| `specimens/<app>/` | Application-specific fixtures, controls, probes, cases |

Use this as ownership guidance, not a requirement to create empty abstractions. Add modules when the next working slice needs them.

## 6. Preserve and migrate the working engine

Keep the cost ledger, budget refusal, guarded patch application, isolated variant state, cancellation, traces, classification discipline, immutable version history, and final seals. Extend their contracts instead of rewriting them wholesale.

Replace the salon loader, fixed server command/health endpoint, BookingSubject, hardcoded browser workflow, observation enums, decoy taxonomy, source allowlist, and salon-specific report strings incrementally. Move legacy domain logic into specimen-owned configuration/fixtures or an explicit compatibility adapter.

Use versioned manifests and a read-only legacy reader. Preserve historical results and evidence; do not rerun or relabel old results as generalized runs. Add architecture checks for production imports of specimen modules and hardcoded domain dispatch. Merely renaming salon types is not completion.

## 7. Evidence that generalization works

Target three independent small applications and six reproducible bugs:

| Application | Behaviors | What differs |
|---|---|---|
| Existing salon | Persistence and account ownership | Retains the known regression baseline |
| Task board | State transition and project/account isolation | Different routes, entities, selectors, and fixture structure |
| Cart/quote tool | Quantity recalculation and invalid-input handling | Numeric assertions and validation rather than booking persistence |

At least the second app must use a different supported build/start layout. Each benchmark case needs two correct implementations, reviewed fault observations, development faults, and a separately prepared evaluation set. Fixtures must not be modified merely to make Confam look effective.

Minimum submission bar: two structurally different applications, at least three reproducible cases spanning different behaviors, one legitimate non-reproduction result, and one explicit unsupported-capability result. Three applications/six cases is the target, not a fact. Falling below the minimum means describing the release as a narrower prototype.

After the core is frozen, use a predeclared transfer exercise: configure an unseen app/case without changing engine source. Record all human edits and setup time. If engine changes are required, report failed transfer; use a fresh case for a subsequent independent attempt. Existing suite fixtures alone are not evidence of unseen-app transfer.

## 8. Fair evaluation and go/no-go decisions

Compare on exactly the same qualified evaluation faults:

1. Existing tests, unchanged. If absent, report absent.
2. A reasonable direct AI-generated suite from the same report/context, without decoy feedback.
3. Confam initial checks, then final checks after any genuine strengthening.

Freeze all suites and record model/version, prompts, inputs, budgets, assertion scope, and authoring time before revealing private evaluation results. Retain comparator suites that reject correct controls and score those false rejections; do not repair, remove, or repeatedly regenerate a weak comparison arm after seeing evaluation outcomes. Use the same independent probes to establish fault labels for every arm. Distinguish faults detected by checks from faults detected only by an oracle: the full candidate-verdict pipeline must not receive an unfair scoring advantage from oracle access.

Report raw caught/survived/uncounted counts by case, correct-control false rejections, reproduction failures, setup minutes, human interventions, run duration, and token-cost estimates. Preserve every attempt and disclose unequal compute. No tiny-sample percentages or statistical claims.

The private evaluation set cannot enter prompts, strengthening, fixture tuning, or feature development. Use a designated evaluator only after all relevant versions are frozen. The owner-written pack remains pending until supplied; development proceeds without fabricating substitute independent evidence.

Decision gates:

- If the second app requires engine-specific business logic, stop feature work and finish the abstraction.
- If check strengthening adds no measured fault detection, show that result and position the value around reproducibility/evidence rather than an unearned superiority claim.
- If direct tests and independent probes provide the same result at lower effort, make decoy analysis optional and test whether its cost is justified.
- If setup repeatedly requires bespoke test engineering, narrow supported integrations and improve onboarding before claiming broad usability.
- If no independent evaluation is available by submission, disclose it and reduce claims; do not relabel development faults.

## 9. Video intake and review experience

Add optional recording intake after the generalized text path works. Verify the current Meta video API contract before implementation. Extract timestamped observations, actions, and uncertainty; ground assertions in developer-confirmed requirements. Apply size/duration/token limits and the existing ledger. Failure to interpret video must permit an explicit text fallback.

Use Spark for intake, structured workflow proposals, decoys, and verifier proposals. Keep Wonder for optional repair; computer-use exploration is stretch. No autonomous browser agent is needed for deterministic replay. Model routing remains explicit and measured.

The local UI shows project/case, input report, confirmed expectations, reproduction, candidate result, challenge counts, missing evidence, and expandable trace/video/diff/observations. Compare original, faulty variant, and candidate at recorded semantic checkpoints; do not imply videos share identical timing unless they do.

A local artifact server must serve only manifest-listed files under the selected run, reject traversal/symlinks, and redact secrets before any user-selected export. No public upload of source, recordings, or traces by default. Authentication, cloud execution, GitHub write actions, and team accounts are later work.

## 10. Milestones and verification

Use stable milestone IDs **TR1–TR5** (technical roadmap). Subtasks use **TR1.1**, **TR1.2**, and so on in the active task board. Keep these IDs in progress reports and commit messages. They replace the earlier M1–M5 labels; T1/T3/T4 remain legacy decoy categories, not milestones. Do not renumber completed work when adding tasks.

Dependencies: TR1 → TR2 → TR3 → TR4 → TR5. Work on an independent subtask may proceed when its prerequisites are met; a milestone is complete only after its own acceptance checks and review.

| Milestone | Owned files/modules | Done when | Verification |
|---|---|---|---|
| TR1: generic project contract | project modules; engine contracts/server/variants; CLI loader; salon configuration | Same engine loads projects and starts isolated variants; no fixed app paths or health routes | Schema/path/lifecycle boundary tests; existing salon CLI behavior preserved |
| TR2: general workflow and first transfer | workflow modules; authoring schemas/prompts; runner; task-board specimen | Variable expectations, typed assertions, and a different app run without engine edits | Browser runs on both apps; relevant assertion failure; no-controls verification; benchmark control rejection |
| TR3: generic challenges and fair comparison | probes; decoys; version gates; freeze/report/heldout; benchmark harness | Dynamic categories/probes, separate modes, sealed comparator suites | Wrong-path/tamper/oracle/cancellation tests; direct-vs-Confam results on development fixtures; private evaluation only after freeze |
| TR4: input and evidence experience | video authoring; CLI report; local web server/UI | Recording plus text fallback and navigable evidence on both apps | One real supported video call under approved scope; real artifacts; export/path checks; browser UI verification |
| TR5: broader evaluation and release | third specimen if time; evaluation tools; documentation; packaging | Transfer attempt, honest results table, reproducible installation/demo | Clean-checkout run; private-file/secret checks; relevant tests/typecheck/quality scan; separate review |

Each substantial code milestone uses the repository's scan → implement → verify → rescan workflow, with an independent review. Fix introduced regressions. Commit each completed coherent milestone under the owner's standing instruction; do not push without a request.

## 11. Delivery sequence and cut order

First deliver TR1 and TR2 as a vertical slice. The critical path is project configuration → general workflow → second-app execution → generic challenge/report semantics → evaluation. UI work must not hide a still-specialized engine.

Then complete TR3, add the smallest TR4 experience, and finish TR5. If time tightens, cut computer-use exploration, third application, advanced video/UI polish, and hosted execution in that order. Preserve two-app transfer, truthful limits, reproduction gates, immutable evidence, independent fault qualification, and benchmark controls. If video is omitted, make no multimodal claim.

The demo should show the same product verifying two different workflows, accepting a correct repair, rejecting a faulty one for an observed reason, and refusing certainty when it cannot reproduce a report. Use measured comparison results only. Label prerecorded and scripted material.

## 12. Validation and later product work

Recruit three to five target developers with permission, observe onboarding, and ask them to bring a report from a repository they can share. Measure setup effort, whether the evidence changes a shipping decision, and whether they would use it for the next repair. No outreach is sent automatically by this plan. Pricing and willingness to pay remain hypotheses.

After the release: additional runtime adapters, CI integration, pull-request evidence, isolated remote execution, reusable reviewed probe libraries, and broader behavior support. Prioritize these from actual adoption friction; do not build a generic plugin marketplace first.

## 13. Positioning and sources

Mutation-guided testing already exists. Confam's proposed contribution is an accessible report-to-reproduction-to-repair-evidence workflow across applications, with explicit evaluation boundaries. Whether that provides sufficient incremental value is an experimental question.

- [Stryker: mutation testing](https://stryker-mutator.io/docs/)
- [Meta: mutation-guided LLM test generation](https://engineering.fb.com/2025/02/05/security/revolutionizing-software-testing-llm-powered-bug-catchers-meta-ach/)
- [Official hackathon information](https://dev.meta.ai/events/global-hackathon)

Sources checked October 28, 2026. No claim of being the first, guaranteed correctness, or benchmark superiority is justified by the current salon results.
