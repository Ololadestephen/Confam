# Mosaic specimen (real application, real bug)

Mosaic is the owner's own Next.js and PostgreSQL application. This specimen uses two real bugs from its history:

- **Sign-in lockout** (`case.json`, `project.json`): successful sign-ins counted toward the 15-per-15-minutes lockout, so a user signing in normally could be locked out. Fixed in `585a8a6`.
- **Workspace re-select** (`case-workspace.json`, `project-workspace.json`): choosing the workspace that was already open cleared the board and left the page on "Opening your workspace…". Fixed in `5a72a3c`. Added through configuration only, with no engine changes.

Mosaic's source is not committed here. `prepare.sh` exports the commit before each fix from the owner's local repository (read-only), reuses that repository's installed dependencies when the lockfile matches, and writes the real fixes as `generated/real-fix.patch` and `generated/workspace-fix.patch`. `source/`, `source-workspace/` and `generated/` are gitignored.

| File | Purpose |
|---|---|
| `prepare.sh` | Export the pre-fix commit and the real fix patch |
| `confam-runtime.mjs` | Per-variant runtime: private embedded PostgreSQL, migrations, Next.js dev server, route warm-up, then opens the port |
| `project.json` | Project configuration; only `src/server/auth/accounts.ts` may be patched |
| `case.json`, `report.md` | The bug report and two expectations |
| `workflow.json` | Registers a user, signs in 15 times, then checks that 15 failed attempts still lock a second account |

```sh
sh specimens/mosaic/prepare.sh
npm run confam -- verify specimens/mosaic/case.json --project specimens/mosaic/project.json --workflow specimens/mosaic/workflow.json --accept --candidate specimens/mosaic/generated/real-fix.patch
```

The workflow signs in 32 times with real password hashing, so the project sets `workflowTimeoutMs` to 90 seconds.
