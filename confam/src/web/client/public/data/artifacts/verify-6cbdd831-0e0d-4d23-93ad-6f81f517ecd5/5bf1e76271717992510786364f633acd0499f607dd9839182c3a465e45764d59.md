Gaps in Linkding's current protection against server-side requests to internal addresses (latest commit, with the 2ffc8bb fix in place)

Muse Spark reviewed the current protection against the two confirmed expectations and proposed five missed ones. The owner confirmed one on October 31: even when the server is configured to use an HTTP proxy, checking a bookmark URL that points at an internal address does not make the server request that address. Linkding's own source already lists this as a known limitation.
