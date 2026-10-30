Review of Bluemax's current quote-form spam limit (commit 5e574fe, the latest code)

The free-quote form posts to the `submit-lead` function, which should refuse more than 5 quote requests per minute from one visitor so the business is not flooded with spam leads. An earlier version kept the count in memory and lost it on every restart; the current version stores each request in a `rate_limits` table. The owner wants to know whether the limit can still be bypassed or silently stop working.
