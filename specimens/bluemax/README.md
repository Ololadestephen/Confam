# Bluemax specimen (real application)

Bluemax is a real solar installer's website in Nigeria, built by the owner with an AI app builder before this hackathon. Most of its history was written by that builder's bot, including the fix used here. Bluemax's source is not in this repository; `prepare.sh` exports it read-only from a local clone into ignored folders. The live Supabase project is never linked, queried or changed.

## The bug

The free-quote form posts to the `submit-lead` edge function, which limits each visitor to 5 requests a minute. Before commit `3ee44d2` the limit lived in the function's memory and reset whenever the function cold-started. The AI-written fix moved it into a `rate_limits` database table.

The case has two expectations: a valid quote request is accepted, and a 6th request within the minute is refused even if the function restarts in between. The workflow sends five requests, restarts, and sends a sixth.

## How it runs

- `prepare.sh` exports the commit before the fix (the `supabase/` folder only) and the real fix. The fix creates a migration file, and Confam fixes may only edit configured files, so the pre-fix copy gets that migration as an empty file. An empty migration changes nothing.
- `confam-runtime.mjs` uses a local Supabase stack in Docker on 127.0.0.1. Variants run one at a time; the first start of each variant resets the local database to that variant's own migrations. A Confam restart keeps the data and removes the edge runtime container, so the function cold-starts as it does in production.
- Probes read the database through the wrapper (`observations.json`), never through the function: stored quote requests (`leads`) and rate-limit rows.

## Limits

- All variants share one local Supabase stack and are isolated by resetting it, so only one Bluemax run can happen at a time.
- Requires Docker and the Supabase CLI. The first start downloads several GB of images.
- The quote form's web page is not driven; the workflow sends the same requests the form sends.

## Gaps found in the current code (October 30)

Muse Spark's gap finder (`draft-gaps`) reviewed the latest code (`5e574fe`) against the two confirmed expectations and proposed five missed expectations. The owner confirmed three, and each was tested on the latest code with its own case and workflow in `gaps/`:

| Confirmed expectation | Latest code, local Supabase |
|---|---|
| A visitor cannot avoid the limit by changing forwarding headers | **Fails**: six requests with six different `X-Forwarded-For` values were all accepted |
| Requests rejected for invalid input do not use up the limit | **Fails**: after five rejected requests (400), a valid request was refused (429) |
| When the request count cannot be checked, further requests are refused | **Fails**: with the rate-limit table unavailable, all six requests were accepted |

The third test uses a fault switch served by the wrapper (`POST /confam-fault/rate-limits-unavailable`), which renames the table; Bluemax's code is unchanged. These results describe the local Supabase stack. Supabase's production gateway may set forwarding headers differently, so the header result has not been confirmed against the live site, and the live site was not tested.
