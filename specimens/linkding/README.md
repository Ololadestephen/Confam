# Linkding: an unfamiliar open-source Django app

[Linkding](https://github.com/sissbruecker/linkding) is a self-hosted bookmark manager (MIT licence) written in Python with Django and SQLite. The author has no connection to it. It was onboarded with configuration only: a setup script, a runtime wrapper, a project file, a case and a two-request workflow. No Confam engine code was changed.

## The real bug: server-side requests to internal addresses

When a user checks or adds a bookmark, Linkding fetches the page on the server to read its title. Before commit `2ffc8bb` ("Add SSRF protection for server-side requests", PR #1488, September 2026), it fetched any URL, including addresses on the server's internal network. The fix's commit lists an AI model as co-author.

The runtime wrapper starts a probe on `127.0.0.1:47901` that stands in for an internal admin panel and counts every request it receives. The workflow checks a bookmark URL pointing at it, then reads the count.

| Version | Check answers normally | Internal requests made |
|---|---|---|
| Before the fix (`ce55000`) | Yes | 1: the bug |
| Linkding's real fix (`2ffc8bb`) | Yes | 0 |
| Latest code (`27b7303`) | Yes | 0 |

The owner confirmed both expectations on October 31. Evidence: `runs/verify-3424bf91-b2cf-4708-a106-7c01e5b96dc9/` and `runs/verify-790d48f1-eb71-4228-bb08-f7a8c4cfc516/` on the author's machine; these folders are not in the repository, so re-run the commands below to see your own. The verify command prints `original: assertion-failed [internalAddressNotFetched]` and `control-real-fix: passed`; the internal request count is in the run's `verification.json`.

## Gaps in the current protection

Muse Spark reviewed the latest protection (five service files; the settings file was left out because it holds Linkding's public placeholder secret key). The exact export was approved first and the live request was refused unless it matched byte for byte. Spark proposed five gaps; each was checked against the code:

| Proposal | Check | Outcome |
|---|---|---|
| An HTTP proxy configured in the environment gets around the protection | Linkding's own module notes list this as a known limitation | Owner confirmed. **Fails on the latest code**: behind a proxy, the internal address was requested once (`runs/verify-c5270923-ab3b-48f6-8c90-b22d0f0f1583/`). Without a proxy the same code makes 0 requests. |
| HTML snapshots can fetch internal resources | Also a documented limitation; needs the snapshot tool and Chromium | Not confirmed: cannot be tested here |
| IPv6 transition addresses (6to4, Teredo) embedding internal IPv4 addresses get through | Tested with Linkding's Python 3.13: all are classified as non-public and blocked | Not confirmed: **Spark's claim was false** |
| A public site whose DNS also returns a private address is blocked | A deliberate fail-safe choice; DNS cannot be controlled locally | Not confirmed |
| Favicon loading sends an unprotected request | Intentional: the favicon service is set by the admin, and the request goes to that service, not to the bookmark's host | Not confirmed |

So this confirms a limitation Linkding already documents rather than discovering a new one, and it shows one Spark claim being checked and rejected.

The proxy case runs the same wrapper with `--http-proxy`: the wrapper becomes a forward proxy configured through `HTTP_PROXY`, and forwards each request to its target, as a proxy inside the same network would.

## The repair loop

`specimens/linkding/repair.json` holds the original protection and the proxy gap. Muse Wonder's first reply was not a usable patch and was rejected before anything ran; its second passed both cases by checking the target's address before handing a request to the proxy. Spark reviewed that fix and proposed five gaps; the author confirmed one: the fix's check and the proxy resolve the name separately, so a name that is public when checked but internal when the proxy fetches it still gets through. The wrapper's `--proxy-resolves=example.com` mode makes the local proxy resolve `example.com` to the internal probe, simulating split-horizon or rebinding DNS. With `project-proxy-dns.json`, the internal address is reached on both the current code and Wonder's fix (`runs/verify-830ce22c-6f30-4630-a032-3db62312a77c/`, local). The check needs the machine to resolve `example.com` publicly.

## Run it

```bash
./specimens/linkding/prepare.sh
npm run confam -- verify specimens/linkding/case.json --project specimens/linkding/project.json --workflow specimens/linkding/workflow.json --accept
npm run confam -- verify specimens/linkding/gaps/case-proxyStillRefusesInternal.json --project specimens/linkding/project-proxy.json --workflow specimens/linkding/gaps/workflow-proxyStillRefusesInternal.json --accept
```

Requires [`uv`](https://docs.astral.sh/uv/) and network access; preparation takes about 10 seconds after the first download. `prepare.sh` clones Linkding into the ignored `upstream/` folder, installs its locked runtime packages (without `uwsgi` and `supervisor`) into an ignored virtual environment with `uv`, and exports the pre-fix and latest commits. Linkding's source is not committed to Confam. The real fix adds a new module, so the pre-fix copy gets it as an empty file and the fix patch fills it in.

## Limits

Ordinary verification on a local copy: no decoys and no held-out evaluation. The real fix serves as the one known-correct reference. The probe port is fixed, so variants must run one at a time.
