# Private held-out evaluation packs

A held-out pack is a set of wrong fixes that nobody involved in building the checks has seen. It is the only independent test of whether frozen checks can tell a wrong fix from a right one. Write the patches outside the development process: at least one by the owner, by hand. Store the pack and its patches privately under `evals/heldout/`, which Git ignores. Agents must not read that folder.

## Format

The pack is a JSON file, normally `evals/heldout/pack.json`:

| Field | Value |
|---|---|
| `schemaVersion` | `1` |
| `purpose` | `"held-out"` for a genuine independent evaluation |
| `label` | A short description of this set |
| `decoys` | 1 to 20 entries, described below |

Each decoy has:

| Field | Value |
|---|---|
| `id` | Starts with a letter; letters, digits, `-` and `_` |
| `patch` | Path to a `.patch` file, relative to the pack file |
| `baseControl` | The correct fix the patch is applied on top of, for example `control-a` |
| `violation` | One sentence: what this fix does wrong |
| `expectationIds` | The confirmed expectations this wrong behaviour breaks |
| `requirements` | Probe results that confirm the wrong behaviour: `{ "probe": ..., "holds": true or false }` |

Probes are named after correct behaviour, so at least one requirement must be `"holds": false`. Use only the case's reviewed probes, and require only results that the workflow observes before the first failed expectation, because checks stop at the first failure. A decoy whose requirements don't match what the probes observe is reported as unconfirmed, never as caught.

## Running it

The evaluation runs against a completed, sealed challenge run and makes no model calls:

```sh
npm run confam -- compare RUN_DIRECTORY --pack evals/heldout/pack.json
```

It verifies the sealed checks and baseline, archives the pack and patch bytes by hash, and evaluates every patch against every sealed arm in isolated copies. Build or start failures, unreached workflows, timeouts, execution errors and unconfirmed violations stay outside the caught and survived counts. The report keeps all outcomes.

A sealed run allows one genuine held-out attempt, including one that ends in an error, so a favourable result cannot be picked after looking at failures. Held-out results never feed back into strengthening, prompts or code for the same evaluation.

`purpose: "integration-fixture"` is for development tests with already-known patches. Those results are labelled separately and never count as held-out evidence.
