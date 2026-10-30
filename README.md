# Confam

> **Confam challenges AI-generated fixes before you ship them.**

A coding agent says the bug is fixed and the tests pass. But would those tests have caught a fix that only *looks* right?

Confam answers that question. It reproduces the reported bug, checks a proposed fix, and then plants **decoy patches**: plausible wrong fixes, such as one that shows "Booking confirmed" without saving anything. If the checks can't tell a decoy from a real fix, the green result means nothing, and Confam says so. The developer gets a reviewable result; their client gets one plain sentence about what was checked.

## What it found

On a fictional salon booking app, four sets of checks were frozen and run against the same six known decoys and two correct fixes:

| Checks | Decoys caught (of 6) | Correct fixes wrongly rejected (of 2) |
|---|---|---|
| The app's existing smoke test | 0 | 0 |
| AI-written tests used exactly as generated | 2 | 2 |
| Confam's checks | 5 | 0 |

The existing test only checks the confirmation message, so every decoy passes it. The raw AI tests reject both correct fixes, so their two catches don't show they can tell right from wrong. These six decoys were used while building Confam's checks, so this is development evidence; an independent comparison on unseen decoys has not been run yet.

Two moments from building those checks:

- **The AI found a gap in what "fixed" meant.** Muse Spark's first checks missed a decoy that saves the booking at 2 a.m. instead of 2 p.m. Asked to strengthen them, Spark didn't invent a test: it reported that none of the agreed expectations mentioned the booked time. The developer added that expectation, and the new checks catch it.
- **On a task board, strengthening closed two real gaps.** The checks reopened the page in the same browser, so fixes that kept the change only in server memory or browser storage got through. Spark proposed restarting the server and opening a fresh browser; after review, 4 of 4 decoys are caught.

Confam also runs on **real applications**, each bug reproduced against the commit before its real fix, with the real fix passing:

- **Mosaic**, the author's own Next.js and PostgreSQL app: two real bugs.
- **Bluemax**, a real solar installer's website in Nigeria built with an AI app builder: the quote form's spam limit reset whenever the function restarted. The fix itself was AI-written. Spark wrote three wrong fixes for it after the checks were agreed, and the checks caught all three, each confirmed wrong by reading the database. Muse Wonder's own fix, built a different way, passed. It runs on a local Supabase stack, never the live site.

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
| Muse Spark | Turns reports and recordings into expectations, drafts checks, writes decoys, and strengthens checks from surviving decoys |
| Muse Wonder | Optional built-in fixer that proposes a repair |

Models never decide whether anything passed: results come only from running the app. The fixer cannot edit checks or probes, and no model writes or approves its own probe. Every model call goes through a cost ledger with a per-run cap.

## Try it

Requires Node 24 LTS, npm, Git and Playwright's Chromium. These commands make no model calls and need no API key:

```sh
npm ci
npx playwright install chromium
npm test
npm run confam -- challenge specimens/salon/cases/booking-integrity/case.json --project specimens/salon/project.json --workflow specimens/salon/cases/booking-integrity/workflow-v2-reviewed.json --manifest specimens/salon/cases/booking-integrity/challenges.json --fixture
```

The last command runs the salon decoy challenge: the original app, two correct fixes and six decoys, each in its own isolated copy. To browse the evidence (recordings, assertions, database observations and version history):

```sh
npm run web:build -w confam
npm run confam -- serve runs
```

Open the printed URL. In Apps you can register a local project, review its detected setup, turn a report into editable expectations and a workflow (model calls need a key and explicit approval of exactly what is sent), then approve a verification run.

For your own application, review its project configuration, case and workflow before using `--accept`. The included `--fixture` cases use scripted confirmation and are not an independent evaluation set.

## Limits

- Evidence covers the confirmed expectations under the recorded conditions. It is not proof that an application is correct.
- Independent evaluation on unseen decoys has not been run yet, and no developers other than the author have used it.
- It runs local web applications that can start from a command with isolated test data. It is not a sandbox for hostile code.
- Supported setups are validated case by case. An external Next.js app was rejected at setup because its assets exceeded the snapshot limit; that result is kept, not hidden.

## Built during the Meta Global AI Developer Hackathon

Everything in this repository was written during the hackathon, from the first commit on October 28, 2026. That includes the engine, the web interface, the salon, task board and quote tool specimen apps, and every check, decoy and probe.

Mosaic and Bluemax were built by the author before the hackathon. They are used only as test subjects: their source is not in this repository, and `specimens/mosaic/` and `specimens/bluemax/` contain only the setup scripts, runtime wrappers, configuration, bug reports, workflows and probes written during the hackathon to test them.

## More

[Usage and supported boundaries](confam/README.md) · [Measured results](confam/EVALUATION.md) · [Release checks](confam/RELEASE.md) · [Roadmap](confam/ROADMAP.md)

Distribution is a source checkout; the workspace package is not a standalone installable CLI.
