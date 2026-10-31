Gaps in Mosaic's current sign-in lockout (latest commit, with the 585a8a6 fix in place)

Muse Spark reviewed the current sign-in code against the two confirmed expectations and proposed five missed ones. The owner confirmed two on October 31: repeated sign-up attempts with an existing account's email never stop its owner signing in with the correct password; and after a correct sign-in, earlier failed attempts no longer count toward the lockout.
