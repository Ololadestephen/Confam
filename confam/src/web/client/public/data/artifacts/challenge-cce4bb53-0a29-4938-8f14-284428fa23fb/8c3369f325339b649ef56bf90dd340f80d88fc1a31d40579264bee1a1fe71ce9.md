Real Mosaic bug report (owner's application, commit 585a8a6 fixes it)

A user who signs in normally several times in a short period gets locked out with "Too many sign-in attempts. Try again in 15 minutes", even though every attempt used the correct password. Parallel test runs on one account hit the same lockout. Successful sign-ins should not use up the sign-in allowance; failed attempts should still lock the account after too many tries.
