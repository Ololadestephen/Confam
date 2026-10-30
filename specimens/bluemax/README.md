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
