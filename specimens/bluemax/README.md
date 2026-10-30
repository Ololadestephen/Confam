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

### Muse Wonder's fix for the three gaps

The owner approved the exact export (the gaps report, all five confirmed expectations and the current function; no checks, probes or fault switch). Wonder's patch validates input before counting, refuses requests with 503 when the count cannot be checked or recorded, and limits by connection address, email and phone instead of the first forwarding header. On the local stack it **passed all five expectations**: the three gap cases, plus a valid request accepted and the limit holding across a restart (checked inside the header case, because Confam gives no verdict on a case whose bug does not reproduce).

A risk the checks cannot see: Wonder takes the visitor's address from the runtime's connection address first. Behind a gateway that address may be the gateway itself, which would put every customer on one shared limit of 5 requests a minute. Locally all traffic comes through one gateway, so this cannot be distinguished here. Its header result also relies partly on the email and phone keys, so a spammer who changes those as well is limited only by address. This patch needs a human review before it is used anywhere.
