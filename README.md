# Confam

> **Confam challenges AI-generated fixes before you ship them.**

A coding agent says the bug is fixed and the tests pass. But would those tests have caught a fix that only *looks* right?

Confam answers that question. It reproduces the reported bug on the real app, checks a proposed fix, and then plants **decoy patches**: plausible wrong fixes, written by Muse Spark, that a weak test would wave through. Each decoy must be confirmed wrong by an independent probe, such as reading the database directly. If the checks can't tell a decoy from a real fix, the green result means nothing, and Confam says so. The developer gets a reviewable result; their client gets one plain sentence about what was checked.

## Results on real applications

Every reproduced bug below is real, taken from the app's own history and reproduced against the commit before its real fix. The "gaps" are different: expectations proposed by Muse Spark and confirmed by the author that fail on the current code. Gap results are ordinary verification runs, without independent correct controls, decoys or held-out faults.

**What you can re-run:** the salon, task board, quote tool and Linkding results run from a fresh clone with no API key. Bluemax and Mosaic can't be re-run by a reader, because their source is private; their folders show exactly how they were tested. The Spark and Wonder steps need a Meta API key.

None of these apps' source is in this repository, and none was built during the hackathon; they are test subjects.

### Bluemax: a real solar installer's website in Nigeria

Bluemax was built with an AI app builder; 106 of its 114 commits were written by that builder's bot. Its free-quote form limits each visitor to 5 requests a minute so the business isn't flooded with spam leads. The limit lived in the function's memory and reset every time the function restarted. The fix, also AI-written, moved it into the database.

| | 6th quote request after a restart | Quote requests stored |
|---|---|---|
| Original | Accepted: the bug | 6 |
| Real (AI-written) fix | Refused: "Too many requests" | 5 |
| Muse Wonder's fix, built a different way | Refused | 5 |

Muse Spark then wrote three wrong fixes against the real one: bring back the in-memory limit, an off-by-one limit check, and a time-window query that never matches stored rows. **The checks caught 3 of 3**, and reading the database confirmed each one really let the spam through. Everything runs on a local Supabase stack in Docker, never the live site.

**Then Spark looked for what the developer missed.** Asked to review Bluemax's *current* code against the agreed expectations, Muse Spark proposed five missing ones. The author confirmed three, and all three **fail on the latest code**, which nobody had fixed:

| Expectation Spark proposed and the author confirmed | Bluemax's current code |
|---|---|
| A visitor can't get around the limit by changing a request header | Fails: six requests with six made-up forwarding addresses were all accepted |
| Mistyped requests don't use up the limit | Fails: after five rejected typos, the customer's real request was refused |
| If the limit can't be checked, spam is refused, not let through | Fails: with the rate-limit table unavailable, every request was accepted |

Muse Wonder then wrote a fix that passes all five expectations. It still needs human review: behind a production gateway, its choice of visitor address could put every customer on one shared limit, which these local checks cannot distinguish.

**Then Spark reviewed Wonder's fix before anyone accepted it.** Given the proposed patch, Spark proposed five more expectations. The author confirmed three, and two of them **fail against Wonder's fix**:

| Expectation Spark proposed and the author confirmed | Muse Wonder's fix |
|---|---|
| Ten quote requests sent at the same moment accept at most five | Fails: all 10 of 10 were accepted, because the limit is checked and recorded in separate steps |
| A request that fails to save because of a server problem doesn't use up the limit | Fails: after one failed save, the customer's fifth real request was refused |
| A garbled submission is reported as a bad request, not a server error | Passes |

So one AI model's fix passed every agreed check, and another found two ways it still lets customers down, both confirmed by running the app. The overlapping requests use Confam's general `parallel` workflow step, which sends every request before waiting for any answer. All of this ran on a local copy; the live site was not tested, and Supabase's production gateway may handle the forwarding header differently. Details: [specimens/bluemax/candidate-gaps](specimens/bluemax/candidate-gaps/README.md).

### Mosaic: the author's own Next.js and PostgreSQL app

| Bug | Original | Real fix | Muse Wonder's fix |
|---|---|---|---|
| Successful sign-ins counted toward the 15-attempt lockout, so careful users got locked out | Fails: locked out after correct sign-ins | Passes | Passes |
| Re-selecting the open workspace left the page stuck on "Opening your workspace…" | Fails: board cleared | Passes | Passes, and is the same one-line guard as the real fix |

**Then Spark looked for what the fix still misses.** Asked to review Mosaic's current sign-in code, Muse Spark proposed five missing expectations. The author confirmed two, and both **fail on the current code** with the lockout message itself:

| Expectation Spark proposed and the author confirmed | Mosaic's current code |
|---|---|
| Repeated sign-up attempts with someone's email never stop them signing in with the right password | Fails: 15 sign-up attempts from another browser locked the owner out, although no wrong password was ever entered |
| After a correct sign-in, earlier typos no longer count toward the lockout | Fails: 7 typos, a correct sign-in, 8 more typos, and the next correct sign-in was refused |

The other three proposals were checked against the code and rejected, with reasons, in [specimens/mosaic/gaps](specimens/mosaic/gaps/README.md).

Each test copy gets its own PostgreSQL database and Next.js server. Spark's decoys were harder to count here: of 4 that applied to the sign-in fix, all 4 failed the check they targeted, but only 1 matched every database value Spark predicted, so 1 is counted as caught and 3 are reported as uncounted. The workspace bug only affects the screen, so there is no independent database reading to confirm a decoy against.

### Linkding: an unfamiliar open-source Django app

[Linkding](https://github.com/sissbruecker/linkding) is a popular self-hosted bookmark manager, written in Python, that the author has no connection to. It was set up with configuration only, no engine changes. Its real security bug: checking a bookmark made the server fetch any URL, including addresses on its internal network. A probe standing in for an internal admin panel counts the requests it receives:

| Version | Internal requests made |
|---|---|
| Before the fix | 1: the bug |
| Linkding's real fix (AI co-authored) | 0 |

Spark then reviewed the current protection and proposed five gaps. One was confirmed and fails: behind an HTTP proxy configured in the environment, the internal address is still requested. Linkding's own code already lists that as a known limitation. Spark also claimed certain IPv6 addresses get through; testing showed they are blocked, so that claim was rejected. Details: [specimens/linkding](specimens/linkding/README.md).

### The repair loop: two models checking each other

`confam repair` runs Muse Wonder and Muse Spark against each other under the developer's control. Wonder proposes a fix for every confirmed expectation at once. Confam runs every case against it, including regression guards for behaviour that already worked. If anything fails, Wonder gets one more attempt and is told only which expectations it missed. A passing fix then goes to Spark for a gap review. Every model call waits for the developer to approve its exact export.

| App | Muse Wonder's repair | Spark's review of that repair | Confirmed gap, run on Wonder's fix |
|---|---|---|---|
| Mosaic | Passed all three cases: both sign-in gaps fixed, original lockout kept | 5 proposals, 1 confirmed | **Fails:** failed sign-ins recorded before an email is registered still lock out its new owner |
| Linkding | Passed both cases: proxy gap fixed, original protection kept (its first reply was not a usable patch and was rejected before anything ran) | 5 proposals, 1 confirmed | **Fails:** when the proxy's own DNS resolves a public name to an internal address, the internal service is still reached |

Each repair passed every check it was given, and each review found something it still misses, confirmed by running the app.

**Round two.** Each confirmed gap was added to its suite and Wonder tried again. Both new repairs passed every case on the first attempt. Mosaic's closes the hole cleanly: a successful registration now also clears failures recorded before the email existed, and Spark's next review found nothing the author chose to confirm. Linkding's passes by never using a proxy for user-supplied URLs. Spark's review flagged the cost, that deployments which can only reach the internet through a proxy would stop loading bookmarks, and the author confirmed it: with a proxy configured, the current code fetches a public page through it (1 request) and Wonder's fix does not (0). A repair that passes every agreed check can still trade one problem for another; the loop surfaced that instead of reporting success. The Linkding gap is tested with a local proxy that resolves `example.com` to the internal probe, simulating split-horizon or rebinding DNS. Spark's proposals are reviewed on the gap review page in the local interface. Total model spend for both apps over two rounds: about $0.40.

## The controlled comparison

Real apps have one real fix, so they can't show whether a set of checks wrongly rejects *correct* fixes. For that, Confam was measured on a purpose-built salon booking app with two independently written correct fixes and six known wrong ones:

| Checks | Known wrong fixes caught (of 6) | Unseen wrong fixes caught (of 4) | Correct fixes wrongly rejected (of 2) |
|---|---|---|---|
| The app's existing smoke test | 0 | 0 | 0 |
| AI-written tests used exactly as generated | 2 | 2 (2 more hit unrelated errors) | 2 |
| Confam's checks | 5 | **4** | 0 |

The existing test only checks the "Booking confirmed" message, so every wrong fix passes it. The raw AI tests reject both correct fixes, so their catches don't show they can tell right from wrong. The six known wrong fixes were used while building Confam's checks, so that column is development evidence.

The four unseen wrong fixes were written after the checks were sealed, by a separate AI agent that was never shown the checks, decoys or results; the author did not write any of them, and they were evaluated once, with the sealed engine. Every one was confirmed wrong by reading the database, and every one passes the app's existing test. They are held out from the checks, but they come from the same family of model that helped build them, and by their database signatures three resemble the broad kinds of wrong fix used in development (a booking stored under the wrong time, lost on restart, or also stored under another customer). Treat this as a first held-out result on 4 faults, not as proof.

Building those checks produced the moment that best shows how Spark is used: its first checks missed a fix that saves the booking at 2 a.m. instead of 2 p.m. Asked to strengthen them, Spark didn't invent a test. It reported that none of the agreed expectations mentioned the booked time. The developer added that expectation, and the new checks catch it.

Full numbers, including what wasn't counted and why: [measured results](confam/EVALUATION.md).

## How it works

1. **Agree what "fixed" means.** The bug report becomes a short list of expectations that the developer confirms.
2. **Reproduce the bug for the right reason.** The original app must fail on the reported behavior, not on a timeout or a missing button.
3. **Challenge the checks.** Decoys are built on a known-correct fix. Each one must be confirmed wrong by an independent probe, such as reading the database directly. Decoys that can't be confirmed are reported as uncounted, never as caught.
4. **Strengthen only where something got through.** A model sees only the surviving decoys and may add checks, or flag that the expectations themselves are incomplete. Changes to what "fixed" means always go back to the developer. At most two rounds.
5. **Freeze, then judge the fix.** The checks are sealed by hash before the candidate fix is evaluated. Results are raw counts with their limits.

The same engine runs each application through configuration: start command, readiness check, isolated test data, source files a fix may touch, and a declarative workflow of browser or HTTP steps.

## How Meta's models are used

| Model | Job |
|---|---|
| Muse Spark | Turns reports and recordings into expectations, drafts checks, writes decoys, strengthens checks from surviving decoys, and reviews code or a proposed fix for expectations the developer missed |
| Muse Wonder | Built-in fixer: proposes a repair, alone or inside the repair loop, where it gets one more attempt with only the expectations it missed |

Models never decide whether anything passed: results come only from running the app. The fixer cannot edit checks or probes, and no model writes or approves its own probe. Every model call goes through a cost ledger with a per-run cap.

## Try it

Requires Node 24 LTS (tested on Node 24 in CI and Node 25 locally; on Node 25, `npm ci` prints a harmless `EBADENGINE` warning), npm, Git and Playwright's Chromium. These commands make no model calls and need no API key:

```sh
npm ci
npx playwright install chromium
npm test
npm run confam -- challenge specimens/salon/cases/booking-integrity/case.json --project specimens/salon/project.json --workflow specimens/salon/cases/booking-integrity/workflow-v2-reviewed.json --manifest specimens/salon/cases/booking-integrity/challenges.json --fixture
```

The last command runs the salon decoy challenge: the original app, two correct fixes and six decoys, each in its own isolated copy. It should print `Development: {"total":6,"caught":5,"survived":0,"uncounted":1}`. To browse the evidence (recordings, assertions, database observations and version history):

```sh
npm run web:build -w confam
npm run confam -- serve runs
```

Keep `serve` running and open the printed URL, including its `?token=` part; the token stops other local pages from reaching your evidence. In Apps you can register a local project, review its detected setup, turn a report into editable expectations and a workflow (model calls need a key and explicit approval of exactly what is sent), then approve a verification run.

For your own application, review its project configuration, case and workflow before using `--accept`. The included `--fixture` cases use scripted confirmation and are not an independent evaluation set.

## Use it on your own app

Confam runs on your machine, or in your CI, against your own copy of the app. It isn't a hosted service: it has to start your app, give each test copy its own data and read that data directly.

1. **Describe how to run the app, once.** A project file names the start command, a readiness URL, the folder where the app keeps its data, and the source files a fix may change. `npm run confam -- serve runs`, then **Apps**, detects a setup for you to review. Apps with a database or cloud services also need a short wrapper script; Linkding's ([specimens/linkding](specimens/linkding/README.md)) is a worked example on a project the author has no connection to.
2. **Turn the bug into confirmed expectations.** In **New run**, paste the report. Muse Spark proposes plain expectations and a browser or HTTP workflow; you see exactly what will be sent before it is sent, then edit and confirm.
3. **Reproduce the bug.** Confam runs the workflow on the unfixed app. It must fail for the reported reason before anything else happens.
4. **Check a fix.** Approve a run with your fix, Muse Wonder's (`draft-fix`), or any agent's patch. The run pages show the verdict with recordings, assertions and database readings.
5. **Optionally challenge, extend and repair.** `challenge` plants Spark-written wrong fixes to show whether the checks would wave them through. `draft-gaps` asks Spark what the expectations, or a proposed fix, still miss, and `repair` runs the Wonder-then-Spark loop above. Spark's proposals appear on the **Gap reviews** page, where you confirm or reject each one; repair sessions show there as a timeline.
6. **Keep it in CI** with `confam review` and the GitHub Action below.

## Use it in CI

`confam review` checks one proposed fix and writes a Markdown review. It exits 0 when the fix passed, 1 when it failed, and 2 when the review was incomplete (for example, the bug didn't reproduce or the app didn't start). An incomplete review is never reported as a pass or a failure. It makes no model calls.

```sh
npm run confam -- review specimens/quote-tool/case-invalid.json --project specimens/quote-tool/project.json --workflow specimens/quote-tool/workflow-invalid.json --candidate specimens/quote-tool/patches/faulty.patch --fixture
```

That example deliberately reviews the faulty patch, so it exits 1 and writes a review saying the candidate failed the required checks.

The same command is a reusable GitHub Action, which posts the review to the job summary. Commit the reviewed case, project and workflow, then (pin a commit SHA instead of `main` for stable results):

```yaml
- uses: Ololadestephen/Confam@main
  with:
    case: confam/case.json
    project: confam/project.json
    workflow: confam/workflow.json
    candidate: fix.patch
    manifest: confam/challenges.json   # optional: also run decoys
    comment: true                      # optional: also post the review on the pull request
```

With `comment: true`, the job needs `permissions: pull-requests: write`. The action posts one comment per case and fix, and updates that comment on later runs instead of adding new ones. If the token cannot comment, as on pull requests from forks, it warns and the review result is unchanged.

This repository's own CI uses the action on the quote tool. It reviews a correct fix, which must pass, and a faulty fix, which must be reported as a failure; on pull requests it also comments the correct fix's review.

## Limits

- Evidence covers the confirmed expectations under the recorded conditions. It is not proof that an application is correct.
- The only held-out evaluation is 4 unseen salon faults written by a blind AI agent, not by an independent person; no developers other than the author have used Confam.
- It runs local web applications that can start from a command with isolated test data. It is not a sandbox for hostile code.
- Supported setups are validated case by case. An external Next.js app was rejected at setup because its assets exceeded the snapshot limit; that result is kept, not hidden.

## Built during the Meta Global AI Developer Hackathon

Everything in this repository was written during the hackathon, from the first commit on October 28, 2026. That includes the engine, the web interface, the salon, task board and quote tool specimen apps, and every check, decoy and probe.

Mosaic and Bluemax were built by the author before the hackathon, and Linkding is an independent open-source project. They are used only as test subjects: their source is not in this repository, and `specimens/mosaic/`, `specimens/bluemax/` and `specimens/linkding/` contain only the setup scripts, runtime wrappers, configuration, bug reports, workflows and probes written during the hackathon to test them.

## More

[Usage and supported boundaries](confam/README.md) · [Measured results](confam/EVALUATION.md) · [Release checks](confam/RELEASE.md) · [Roadmap](confam/ROADMAP.md)

Distribution is a source checkout; the workspace package is not a standalone installable CLI.
