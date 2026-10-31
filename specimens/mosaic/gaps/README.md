# Gaps in Mosaic's current sign-in lockout

Muse Spark reviewed Mosaic's current sign-in code (commit `d796b20`, with the real lockout fix from `585a8a6` in place) against the two confirmed expectations. The exact export was previewed and approved first, and the live request was refused unless it matched that preview byte for byte. Spark proposed five missed expectations. The owner confirmed two on October 31. Both fail on the current code, and in both runs the owner is refused with the lockout message itself, "Too many sign-in attempts".

| Expectation | Current Mosaic code |
|---|---|
| Repeated sign-up attempts with an existing account's email never stop its owner signing in with the correct password. | Fails. 15 sign-up attempts from another browser locked the owner out, although no wrong password was ever entered. Sign-up counts against the same per-email limit as sign-in, and it counts before checking whether registration is open. |
| After a correct sign-in, earlier failed attempts no longer count toward the lockout. | Fails. 7 typos, a correct sign-in, then 8 more typos, and the owner's next correct sign-in was refused. |

The second workflow is built so its outcome does not depend on the first gap: with forgiveness only the last 8 attempts count, and without it at least 15 do, whether or not the sign-up is counted.

The other three proposals were reviewed and not confirmed: locking an account by failed attempts from anywhere is the confirmed design; passwords shorter than 12 characters can never match an account, so not counting them is harmless; and the access-link limit uses a header that Mosaic's hosting platform overwrites, so a local run would show a bypass that production may not have.

## The repair loop

`specimens/mosaic/repair.json` holds the original case and both gaps. Muse Wonder's first fix passed all three: sign-ups count against their own limit, and a correct sign-in clears the failure count. Spark reviewed that fix and proposed five more gaps; the author confirmed one: failed sign-ins recorded before an email is registered must not lock out the person who then registers it (`case-earlyFailuresDoNotLockNewOwner.json`). It fails on the current code and on Wonder's fix, both times with the lockout message (`runs/verify-a5103ae1-40c5-4ead-a712-5da9ebf0b3a7/`, local).

Round two: with that gap added to the suite, Wonder's next fix passed all four cases (a successful registration also clears earlier failures). Spark's review of it proposed five more; none was confirmed: the lockout lifting after 15 minutes needs a faked clock, sign-up spam blocking a registration needs requests the browser form likely prevents, and the other three were rejected in earlier reviews.

## Run it

```bash
./specimens/mosaic/prepare.sh
npm run confam -- verify specimens/mosaic/gaps/case-signUpDoesNotLockSignIn.json --project specimens/mosaic/project-latest.json --workflow specimens/mosaic/gaps/workflow-signUpDoesNotLockSignIn.json --accept
```

`prepare.sh` exports Mosaic's latest commit into the ignored `source-latest/` folder; the Mosaic repository is only read. Evidence from October 31: `runs/verify-3de13e51-84cd-40d7-aa6e-f06635e15213/` and `runs/verify-a6c88f0a-a7fc-40ae-8837-9262717fb88c/` (local, not committed).

## Limits

These are ordinary verification runs on a local copy with its own PostgreSQL database. No corrected version has been run against these workflows yet, so false-rejection calibration is unavailable. There are no decoys and no held-out evaluation.
