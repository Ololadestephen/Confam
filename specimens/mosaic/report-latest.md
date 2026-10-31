Mosaic's sign-in lockout as it stands today (latest commit; the fix from 585a8a6 is in place)

The owner confirmed two expectations for the sign-in lockout: a user who signs in with the correct password 15 times in a row is never refused, and after 15 failed attempts for an email even the correct password is refused with the lockout message. This review asks what the current sign-in code still misses: ways the lockout can be avoided, ways honest users can still be locked out, or behavior the two expectations do not cover.
