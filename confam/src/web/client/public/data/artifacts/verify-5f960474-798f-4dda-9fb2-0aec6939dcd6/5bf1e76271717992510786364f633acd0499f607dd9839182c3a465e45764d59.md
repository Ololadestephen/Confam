Gaps in Bluemax's current quote-form spam limit (commit 5e574fe)

Muse Spark reviewed the current `submit-lead` function against the two confirmed expectations and proposed five expectations the developer had missed. The owner confirmed three on October 30: a visitor cannot avoid the limit by changing forwarding headers; requests rejected for invalid input do not use up the limit; and when the recent-request count cannot be checked, further requests are refused rather than accepted without limit (the owner chose to fail closed).
