Linkding's protection against server-side requests to internal addresses, as it stands today (latest commit; the SSRF fix from 2ffc8bb is in place)

The owner confirmed two expectations: checking a bookmark URL that points at an internal address still answers normally, and it does not make the server request that address. This review asks what the current protection still misses: other ways a user-supplied URL could make the server reach an internal address, or ways the protection could block or break normal use.
