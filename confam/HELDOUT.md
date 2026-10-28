# Private held-out evaluation packs

Prepare the independent patches outside the development process, including the owner's hand-written decoy. Store the actual pack and patches privately, normally under `evals/heldout/`. Agents must not inspect their contents while developing. This document describes the input format only.

The pack is a JSON object with these fields:

| Field | Value |
|---|---|
| `schemaVersion` | `1` |
| `purpose` | `"held-out"` for genuine independent evaluation |
| `label` | A short description of this independent set |
| `decoys` | An array of 1–20 entries described below |

Each decoy contains `id` (lowercase letters, digits and hyphens), `patch` (a relative path to a regular `.patch` file inside the pack directory), `violation` (the declared wrong behavior), and `requirements` (curated probe results needed to confirm that wrong behavior). Each requirement has a `probe` string and a boolean `holds` value.

Available probes are `appointment-saved`, `appointment-owned-by-customer`, and `appointment-survives-restart`. Their names describe correct behavior, so at least one required result must be `false` to establish a violation. Wrong ownership additionally requires `appointment-saved: true` alongside `appointment-owned-by-customer: false`; an absent booking does not establish that it was saved under the wrong owner. Do not invent a probe or weaken its implementation to fit a patch.

The command requires a completed final checks seal:

```sh
npm run confam -- heldout SESSION_ID --pack evals/heldout/pack.json
```

It verifies the frozen checks and baseline, hashes and archives the pack and patch bytes, and evaluates each patch in an isolated variant. It makes no model calls. Build/start failures, unreached workflows, timeouts, execution errors, and unconfirmed violations stay outside caught/survived counts. The archived report keeps all outcomes.

A frozen run permits one genuine evaluation attempt, including an attempt that ends in an execution error. This prevents selecting a favorable result after inspecting failures. Use new independent material for a future independently evaluated run; held-out results never feed back into strengthening, prompts or code for the same evaluation.

`purpose: "integration-fixture"` is reserved for development tests using already-known patches. Those results are labelled separately and never change the run's genuine held-out counts or promote its client verdict. Scripted model runs cannot claim genuine held-out evaluation.
