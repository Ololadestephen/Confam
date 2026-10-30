# Measured prototype results — October 29, 2026

These are development and release checks on fictional fixtures, not independent benchmark results. Workflows, expectation confirmations, candidate patches and the new quote service were authored as sample material. Original assertion failures and candidate results come from actual isolated local runs.

## Behavioral coverage

| Application/case | Original observed result | Repair observed result | Scope |
|---|---|---|---|
| Salon persistence | `appointmentPersists` failed | Candidate and both supplied controls passed browser checks and probes | One configured appointment; known fixture |
| Task-board persistence | `completionPersists` failed | Candidate and both supplied controls passed browser checks and probes | One configured task; known fixture |
| Quote quantity | total 12, expected 36 | Good and incomplete candidates each returned 36 | Quantity 3, unit price 12; HTTP observations |
| Quote invalid quantity | HTTP 200, expected 400 | Good candidate returned 400 and retained quantity 1; incomplete candidate returned 200 and failed | Quantity -2; HTTP observations |

That is four reproducible fixture cases across three applications, including two browser applications and one HTTP-only service. It meets the prototype minimum of at least three cases on two applications. The six-case target has not been reached. It does not establish arbitrary application support or broader numeric/validation coverage.

The incomplete quote repair passes one case and fails the other. Passing a workflow is scoped evidence; it does not mean all behavior is correct. Quote verification has no independently correct controls or reviewed probes. Its false-rejection calibration and independent decoy qualification are unavailable. The original stops at its first failed assertion, so an unexecuted later assertion is not reported as observed.

Two explicit negative-path exercises were also executed:

- Non-reproduction: the original's unit price already equals 12, so candidate evaluation is blocked and there is no repair verdict. This is a deliberately constructed gate exercise, not a naturally reported historical bug.
- Unsupported capability: project configuration declares restart unavailable. A workflow requesting restart is rejected before application evaluation. This demonstrates capability preflight, not discovery of a runtime failure.

## Development challenges and comparison

| Fixture | Qualified development faults | Caught | Survived | Uncounted | Supplied controls passing |
|---|---|---|---|---|---|
| Task-board persistence | 1 | 1 | 0 | 0 | 2 of 2 |
| Salon persistence | 1 | 1 | 0 | 0 | 2 of 2 |

For each app, the post-freeze integration comparison deliberately reuses its known development fault. Initial and final Confam arms each catch 1 of 1, with 0 survived, 0 uncounted, 0 false rejections and 0 control execution errors. These are machinery checks on known faults. They do not establish unseen-fault performance. No strengthening was performed because the sole development fault was caught; no detection improvement was measured. Existing-test and direct-AI comparator arms are absent; no superiority claim is justified.

Genuine independent evaluation: **not performed**. The owner's private pack remains deferred and was not inspected. Developer adoption and willingness to pay: **not measured**. No developer outreach was sent.

## Frozen-engine transfer attempt

Before creating the quote fixture, the engine was frozen at `c70bf4d`; every file under `confam/src/` was hashed. The attempt predeclared numeric recalculation and invalid-input checks. All checks used project/case/workflow configuration and patches; no engine source files were added or changed. The fixture was not modified after its first evaluation.

This was a newly authored synthetic HTTP fixture built for the exercise. It was not an externally supplied, independently unseen project. The successful narrow transfer is evidence of configuration reuse, not independent onboarding or unknown-repository generality.

Elapsed agent wall time from declaration to first successful quantity result: 67.793 seconds. Human setup effort was not measured; this is not a claim about developer setup minutes. Added files comprise the service, project configuration, three reports, three case definitions, four workflows, two candidate patches and fixture documentation. There were no post-execution fixture corrections or engine interventions.

## Time, model cost and evidence

The quote quantity run recorded workflow execution durations of 612ms original / 193ms candidate. Invalid-input good-candidate run recorded 487ms / 308ms; incomplete-candidate invalid-input run recorded 718ms / 331ms. These are workflow durations, excluding application setup, snapshot creation and installation. Parallel runs and machine-specific timing prevent using these numbers as a performance comparison.

TR5 application Meta API spend: **$0**. Development-agent compute is not included or measured. No project context was sent to Meta during these checks. Separately, TR4's one approved 4.6-second recording interpretation cost an estimated $0.008239, with settled usage under its $0.25 cap. One clip does not establish broad video accuracy. Earlier generic workflow/decoy authoring paths remain fixture-tested; the live recording result does not validate them.

Private run manifests, traces, videos, transfer declaration, hashes and logs remain under ignored `runs/`. Public summaries deliberately exclude raw evidence and secrets. The source-checkout release procedure is documented in [RELEASE.md](RELEASE.md). Demo recording is deferred at the owner's request. The project is not declared finished by these prototype checks.


## ON5 external application attempt — October 30, 2026

An owner-selected external Next.js application was inspected after freezing Confam at `176f1ee213b52be8c89e1cdc94f4c3037333cbdf`. Unlike the synthetic quote fixture, this repository already existed outside the project. No engine or application source was changed during the attempt.

Public anonymous guest-practice observations covered entering a battle, advancing a round, recovering the same battle after refresh, a special move entering cooldown, and recovering that state after reopening. These are scoped public-site observations, separate from controlled local execution; deployment identity was not matched to the repository revision. They establish no repair result.

The local project and scripted smoke workflow passed configuration validation, but the existing execution snapshot preparation rejected the repository with `Snapshot exceeds file or byte limit`. Runtime assets exceed the 20 MiB snapshot budget. The application was not started by Confam; no browser execution job, original reproduction or candidate evaluation completed. Limits were not raised and assets were not removed to change this outcome. **Configuration-only transfer was unsupported.**

Separately, the external repository's unchanged test suite passed 505 tests with 1 skipped across 92 files; typecheck and lint passed under Node 24.22.1 after locked dependency installation with lifecycle scripts disabled. Its production build exited 1 with a dependency security guard. These application checks do not substitute for a Confam run. Detailed source findings and raw logs remain private local evidence.

Preparation also exposed requirements for dependency/build preparation and a configured application origin matching the isolated runtime port. These are source-inspection findings, not additional observed execution failures: snapshot preparation stopped first. No defect or candidate repair was supplied, no independent fault pack was used, and no project data was sent to Meta ($0 application API spend). Human setup time was not measured; interrupted session wall time is not a setup benchmark.

The next integration work should address bounded runtime snapshots, explicit dependency/build preparation and runtime environment binding as shared capabilities. This attempt is preserved as an unsupported result; improving support cannot retroactively make the frozen transfer successful.
