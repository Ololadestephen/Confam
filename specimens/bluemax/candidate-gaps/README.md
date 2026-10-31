# Gaps in a proposed Bluemax fix

Muse Wonder proposed a fix for the three confirmed gaps in Bluemax's current spam limit (see `../gaps/`). Before anyone accepted that fix, `draft-gaps --candidate` sent it to Muse Spark with the confirmed expectations and asked what the fix still misses. The exact export was previewed first, and the live request was refused unless it matched that preview byte for byte. Spark proposed five gaps. The owner reviewed all five and confirmed three as expectations on October 31 (the other two contradict expectations confirmed earlier: fail closed, and invalid requests do not use up the limit):

| Case | Expectation | Result against Wonder's fix |
|---|---|---|
| b1 | Ten overlapping valid requests from one visitor accept at most five. | Reproduced: all 10 of 10 were accepted. |
| b4 | A valid request that fails to save because of a server problem does not use up the visitor's allowance. | Reproduced: after one failed save, the fifth valid request was refused with 429. |
| b5 | A garbled submission is reported as a bad request. | Not reproduced: the fix already answers 400. |

b1 uses the general `parallel` workflow action, which sends all ten requests before waiting for any answer. b4 uses a test-only fault switch in the local wrapper (`/confam-fault/leads-unavailable`) that temporarily renames the local `leads` table. Neither is part of Bluemax.

## Run it

```bash
./specimens/bluemax/prepare.sh
./specimens/bluemax/candidate-gaps/prepare.sh
npm run confam -- verify specimens/bluemax/candidate-gaps/case-b1.json --project specimens/bluemax/candidate-gaps/project.json --workflow specimens/bluemax/candidate-gaps/workflow-b1.json --accept
```

`prepare.sh` applies Wonder's patch from the ignored `../generated/wonder-gaps-fix.patch`, which contains Bluemax code and is not committed. Everything runs on the local Supabase stack in Docker, never the live project.

## Limits

These are ordinary verification runs: no independently correct controls, no decoys and no held-out evaluation. The results show that this proposed fix misses two confirmed expectations under these local conditions. They do not show that any other version of Bluemax is correct.
