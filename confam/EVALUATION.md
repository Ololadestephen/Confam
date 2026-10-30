# Measured prototype results

Every number below comes from an actual local run. Development results and independent results are reported separately, as raw counts. A "known-fault" comparison reuses faults that were already used while building the checks, so it is development evidence, not an independent measurement.

## October 30, 2026 (later): live Meta usage across the cases

Every call below was approved in advance from an exact export preview, ran through the shared cost ledger, and was evaluated by Confam itself rather than by the model.

### Muse Wonder fixes

The new generic `draft-fix` command sends only the bug report, the confirmed expectations and the source files the project allows a fix to touch. Each returned diff was guarded, normalized and then evaluated as a candidate.

| Case | Files Wonder changed | Result against the checks | Estimated cost |
|---|---|---|---|
| Salon booking integrity | `server.js` (time conversion, error instead of false confirmation) | Passed all five expectations; both correct fixes also passed | $0.0355 |
| Task board | `backend/main.cjs` (save the completed state) | Passed the frozen strengthened checks | $0.0269 |
| Quote saved total | `service/quotes.cjs` (recalculate the total) | Passed | $0.0202 |
| Mosaic sign-in lockout (real) | `accounts.ts`: check the lock first, count only failures (same structure as the real fix) | Passed both expectations | $0.0620 |
| Mosaic workspace re-select (real) | `workspace-app.tsx`: the same one-line guard as the real fix | Passed | $0.0226 |

Passing these checks is evidence for the listed expectations only. Quote and Mosaic have no second independently written correct fix, so false-rejection calibration is unavailable there.

### Muse Spark decoys written after the checks were frozen

Spark wrote decoys against the known-correct reference. None of them existed when the salon and task-board checks were built and frozen, and none was used to shape them. They are still model-written development faults, not the owner's independent pack.

| Case | Proposed | Applicable | Caught | Survived | Uncounted |
|---|---|---|---|---|---|
| Salon booking integrity | 3 | 3 | 3 | 0 | 0 |
| Task board | 3 | 3 | 3 | 0 | 0 |

Getting there exposed three more ways model-written diffs break, each now repaired or recorded generically with tests: a missing final newline, a `diff --git` header without `---`/`+++` lines, and context lines that misquote the file. Applicable decoys are now kept and an inapplicable one is recorded as rejected with its reason, instead of one bad diff discarding the whole batch. Five attempts failed at this stage before the fixes; their costs are included below.

### Recording intake

Two fictional clips were recorded locally with Playwright from the original apps and sent with their written reports.

| Clip | What Spark reported | Check against the frames | Estimated cost |
|---|---|---|---|
| Salon, 8.9 s | "Booking confirmed" with Sat 5 Jan 2:00 PM listed at 3.5 s; form and list reset with "No upcoming appointments" at 5.9 s | Matches (confirmation visible at 3.6–4.4 s, reset visible by 5.2 s) | $0.0089 |
| Task board, 6.9 s | Completed and "Update confirmed" at 1.2 s; back to Todo at 3.7 s | Matches | $0.0080 |

Spark stated what the video cannot show: whether the reset came from a reload, and whether anything was saved on a server. Its suggested expectations for the salon clip match the written report it was given, so they are not evidence of video understanding alone.

### Fresh checks drafted from scratch

Spark drafted task-board checks from the report and confirmed expectation ($0.0113). They passed the reproduction and correct-fix gates on the first run with no corrections. Like the original task-board checks, they reopen the page in the same browser and do not restart the server.

### Cost

Estimated spend for this batch: about $0.28 (Wonder fixes $0.167, recordings $0.017, fresh checks $0.011, decoy drafting $0.088 including five failed attempts). Running total for October 30: about $0.43.

## October 30, 2026: decoy challenges, comparison and real-app cases

### Decoy challenges (development faults)

A decoy is a deliberately wrong fix that looks plausible. It counts as caught or survived only if it builds, reaches the workflow, and a reviewed probe independently confirms the wrongness it declares. Anything else is reported as uncounted.

| Case | Checks | Decoys | Caught | Survived | Uncounted | Correct fixes passing |
|---|---|---|---|---|---|---|
| Salon booking integrity | Muse Spark draft, four expectations, run unedited | 6 (hand-written) | 4 | 1 | 1 | 2 of 2 |
| Salon booking integrity | Muse Spark draft for five expectations, four documented review corrections, frozen | 6 (same) | 5 | 0 | 1 | 2 of 2 |
| Task board | Original workflow | 4 (hand-written) | 2 | 2 | 0 | 2 of 2 |
| Task board | After one Muse Spark strengthening round approved by the owner, frozen | 4 (same) | 4 | 0 | 0 | 2 of 2 |
| Mosaic sign-in lockout (real app) | Owner-confirmed workflow | 3 (written by Muse Spark) | 1 | 0 | 2 | 1 of 1 (the real fix) |

How the salon checks changed: the first Spark checks missed a decoy that saves the booking at 2 a.m. instead of 2 p.m. Live Spark strengthening saw only that survivor and returned the checks unchanged, explaining that catching it needs an expectation about the booked time, which none of the four agreed expectations covered. The owner approved a fifth expectation ("The listed appointment shows the date and time that was booked"), Spark drafted checks for all five, and the frozen checks catch it. The remaining uncounted salon decoy (browser storage only) fails only because a server restart moves the app to a new port, which clears browser storage; it was not linked to that expectation, so it is not counted. Review corrections are listed in `specimens/salon/cases/booking-integrity/REVIEW.md`.

How the task-board checks changed: the original workflow reopens the page in the same browser and never restarts the server, so "server memory only" and "browser storage only" survived. Spark's strengthening round appended a restart, a fresh browser and a re-check of the existing expectation. Confam paused it for owner review; the owner approved it as within the expectation. See `specimens/task-board/REVIEW.md`.

Why two Mosaic decoys are uncounted: both failed a mapped check, but the probe results Spark declared for them did not match what the database showed. One required observations of a second account that never exist, because the workflow stops at the first failure; the other required a failure count of 15 where 16 was observed. Confam does not count a decoy whose declared wrongness is not independently confirmed, and the declarations were not edited after seeing the results.

### Comparison on known faults (salon)

All four arms were frozen together, then run against the same six known decoys and both correct fixes. These decoys were used while building the Confam checks, so this is not an independent comparison.

| Arm | Caught | Survived | Uncounted | Correct fixes wrongly rejected |
|---|---|---|---|---|
| The app's existing smoke test, translated step for step | 0 | 6 | 0 | 0 of 2 |
| Direct AI: Muse Spark's draft used exactly as generated (no review, gates or decoy feedback) | 2 | 0 | 4 | 2 of 2 |
| Confam initial checks | 5 | 0 | 1 | 0 of 2 |
| Confam final checks | 5 | 0 | 1 | 0 of 2 |

The existing smoke test only checks that the page says "Booking confirmed", so every decoy passes it. The direct-AI suite rejects both correct fixes (it reads the status message before it appears), so its two catches do not show that it can tell right from wrong. Genuine comparison on unseen faults requires the owner's held-out pack, which has not been run.

### Real application: Mosaic

Mosaic is the author's own Next.js and PostgreSQL application. Two real bugs from its history were reproduced, each against the commit before its real fix. Each test copy gets its own embedded PostgreSQL and Next.js server. Mosaic's source is not included in this repository.

| Bug | Fixed in | Original | Real fix | Setup |
|---|---|---|---|---|
| Successful sign-ins counted toward the 15-attempt lockout | `585a8a6` | Fails: locked out after correct sign-ins | Passes both expectations | Required one engine change: a per-project workflow deadline, because 32 real sign-ins exceed the fixed 30-second default |
| Re-selecting the open workspace left the page stuck loading | `5a72a3c` | Fails: board cleared | Passes | Configuration only |

Mosaic has no second independently written correct fix, so false-rejection calibration is unavailable for these cases.

**Second round of Spark decoys for the sign-in bug (October 30, later).** The first round left two of three decoys uncounted. One of those, countSuccesses, was uncounted because the decoy instructions asked Spark to require probes that the workflow never reaches once the first expectation fails. The instructions now say that checks stop at the first failed expectation and that a probe should be required only if it is observed before the violation. The oracle rule is unchanged. Decoy drafting also gained a `--preview` option, and the owner approved the exact export before it was sent ($0.0166).

Spark proposed three decoys. Two were rejected at authoring because their diffs quoted source lines that do not exist. The third, limit-too-high, raises the lockout limit from 15 to 100. The checks failed it on the right expectation (failuresStillLock), and the probes showed the locked account got a new session. It is still **uncounted**: Spark declared that the failed-attempt count would stay at 15, but 16 was observed. That count includes the registration request, which Mosaic records in the same window, so an app without the lockout records one more attempt. The declaration was not edited after seeing the result.

Mosaic sign-in decoys across both rounds: 6 proposed, 4 applicable, 1 caught, 0 survived, 3 uncounted. Every applicable decoy failed a check mapped to the expectation it targeted, but only one matched its own declared probe results. The real-app evidence is the two reproductions and the real fix passing, not decoy strength. The workspace bug is a display-only fault with no independent database observation, so no decoys were drafted for it.

### Real application: Bluemax

Bluemax is a real solar installer's website in Nigeria, built by the author with an AI app builder before the hackathon; 106 of its 114 commits were written by that builder's bot. The chosen bug: the free-quote form's spam limit (5 requests a minute) lived in the edge function's memory and reset on every cold start. The bot-written fix `3ee44d2` moved it into a database table. Bluemax's source is not in this repository, and every run used a local Supabase stack in Docker, never the live project. See `specimens/bluemax/README.md`.

| | 6th request after a restart | Quote requests stored | Rate-limit rows |
|---|---|---|---|
| Original (before `3ee44d2`) | Accepted (200) | 6 | none (no table) |
| Real fix | Refused (429, "Too many requests") | 5 | 5 |

The owner confirmed two expectations (a valid request is accepted; a 6th request within the minute is refused even across a restart) and two reviewed probes (5 stored requests, 5 rate-limit rows). Accepted run: the original fails on the spam-limit expectation and the real fix passes. Setup was configuration only; four wrapper problems found while setting it up are listed in the specimen README, including that the first restart was not a real cold start.

Spark wrote three decoys against the real fix after the owner approved the exact export ($0.0182): bring back the in-memory limit, an off-by-one limit check, and a time-window query that never matches stored rows. **3 of 3 caught, 0 survived, 0 uncounted**; each failed the spam-limit expectation and both probes confirmed it was wrong. These are development decoys on one visitor and one request path; they do not test, for example, what happens when the rate-limit query itself errors.

**Muse Wonder's fix.** The owner approved the exact export (the report, the two expectations and the pre-fix function; no checks, probes, decoys or real fix), $0.0899. Wonder's patch applied and **passed both checks**: a valid request accepted, and the 6th request refused after a restart. Its design differs from the real fix: it keeps one counter row per visitor instead of one row per request, so the database held 5 stored requests (matching the reviewed probe) but 1 rate-limit row, not 5. The `requestsRecorded` probe therefore describes the real fix's design, not the expectation. It is sound for decoys built on the real fix, but it would wrongly reject a correct alternative design if applied to candidates, and it was not. Like the real fix, Wonder's version falls back silently when the database check fails (to an in-memory limit rather than letting every request through); the checks do not cover that path.

### Cases and engine fixes

Reproducible cases now span four applications: salon, task board, quote tool and Mosaic. A new quote case checks the saved total rather than the update response; both quote candidate patches pass it, because the faulty patch's defect is input validation.

Running these cases live exposed five engine bugs, each fixed with a test: `reload` after `restart` reloaded the old port; workflow drafting and decoy drafting were cut off at 4,096 output tokens; live strengthening sent a schema format Meta's structured output rejects, so it had never run against the real API; and model-written diffs with missing headers or wrong hunk counts were rejected (now normalized by git's own recount, after protected-path checks).

### Model usage and cost

All live calls used `muse-spark-1.3` through the shared ledger, with estimated costs from published rates (not invoice-reconciled): three checks drafts ($0.0258 rejected at the output limit, $0.0290, $0.0317), two strengthening rounds ($0.0140, $0.0186) and two Mosaic decoy drafts ($0.0159 with malformed diffs, $0.0151). October 30 total: about $0.15.

### Not yet measured

- Independent evaluation: the owner's held-out pack has not been run.
- Developer adoption and setup effort for people other than the author.
- Broader video intake accuracy beyond the single October 29 clip.

## October 29, 2026: prototype checks

These are development and release checks on fictional fixtures, not independent benchmark results. Workflows, expectation confirmations, candidate patches and the new quote service were authored as sample material. Original assertion failures and candidate results come from actual isolated local runs.

### Behavioral coverage

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

### Development challenges and comparison

| Fixture | Qualified development faults | Caught | Survived | Uncounted | Supplied controls passing |
|---|---|---|---|---|---|
| Task-board persistence | 1 | 1 | 0 | 0 | 2 of 2 |
| Salon persistence | 1 | 1 | 0 | 0 | 2 of 2 |

For each app, the post-freeze integration comparison deliberately reuses its known development fault. Initial and final Confam arms each catch 1 of 1, with 0 survived, 0 uncounted, 0 false rejections and 0 control execution errors. These are machinery checks on known faults. They do not establish unseen-fault performance. No strengthening was performed because the sole development fault was caught; no detection improvement was measured. Existing-test and direct-AI comparator arms are absent; no superiority claim is justified.

Genuine independent evaluation: **not performed**. The owner's private pack remains deferred and was not inspected. Developer adoption and willingness to pay: **not measured**. No developer outreach was sent.

### Frozen-engine transfer attempt

Before creating the quote fixture, the engine was frozen at `c70bf4d`; every file under `confam/src/` was hashed. The attempt predeclared numeric recalculation and invalid-input checks. All checks used project/case/workflow configuration and patches; no engine source files were added or changed. The fixture was not modified after its first evaluation.

This was a newly authored synthetic HTTP fixture built for the exercise. It was not an externally supplied, independently unseen project. The successful narrow transfer is evidence of configuration reuse, not independent onboarding or unknown-repository generality.

Elapsed agent wall time from declaration to first successful quantity result: 67.793 seconds. Human setup effort was not measured; this is not a claim about developer setup minutes. Added files comprise the service, project configuration, three reports, three case definitions, four workflows, two candidate patches and fixture documentation. There were no post-execution fixture corrections or engine interventions.

### Time, model cost and evidence

The quote quantity run recorded workflow execution durations of 612ms original / 193ms candidate. Invalid-input good-candidate run recorded 487ms / 308ms; incomplete-candidate invalid-input run recorded 718ms / 331ms. These are workflow durations, excluding application setup, snapshot creation and installation. Parallel runs and machine-specific timing prevent using these numbers as a performance comparison.

TR5 application Meta API spend: **$0**. Development-agent compute is not included or measured. No project context was sent to Meta during these checks. Separately, TR4's one approved 4.6-second recording interpretation cost an estimated $0.008239, with settled usage under its $0.25 cap. One clip does not establish broad video accuracy. Earlier generic workflow/decoy authoring paths remain fixture-tested; the live recording result does not validate them.

Private run manifests, traces, videos, transfer declaration, hashes and logs remain under ignored `runs/`. Public summaries deliberately exclude raw evidence and secrets. The source-checkout release procedure is documented in [RELEASE.md](RELEASE.md). Demo recording is deferred at the owner's request. The project is not declared finished by these prototype checks.


### ON5 external application attempt — October 30, 2026

An owner-selected external Next.js application was inspected after freezing Confam at `176f1ee213b52be8c89e1cdc94f4c3037333cbdf`. Unlike the synthetic quote fixture, this repository already existed outside the project. No engine or application source was changed during the attempt.

Public anonymous guest-practice observations covered entering a battle, advancing a round, recovering the same battle after refresh, a special move entering cooldown, and recovering that state after reopening. These are scoped public-site observations, separate from controlled local execution; deployment identity was not matched to the repository revision. They establish no repair result.

The local project and scripted smoke workflow passed configuration validation, but the existing execution snapshot preparation rejected the repository with `Snapshot exceeds file or byte limit`. Runtime assets exceed the 20 MiB snapshot budget. The application was not started by Confam; no browser execution job, original reproduction or candidate evaluation completed. Limits were not raised and assets were not removed to change this outcome. **Configuration-only transfer was unsupported.**

Separately, the external repository's unchanged test suite passed 505 tests with 1 skipped across 92 files; typecheck and lint passed under Node 24.22.1 after locked dependency installation with lifecycle scripts disabled. Its production build exited 1 with a dependency security guard. These application checks do not substitute for a Confam run. Detailed source findings and raw logs remain private local evidence.

Preparation also exposed requirements for dependency/build preparation and a configured application origin matching the isolated runtime port. These are source-inspection findings, not additional observed execution failures: snapshot preparation stopped first. No defect or candidate repair was supplied, no independent fault pack was used, and no project data was sent to Meta ($0 application API spend). Human setup time was not measured; interrupted session wall time is not a setup benchmark.

The next integration work should address bounded runtime snapshots, explicit dependency/build preparation and runtime environment binding as shared capabilities. This attempt is preserved as an unsupported result; improving support cannot retroactively make the frozen transfer successful.
