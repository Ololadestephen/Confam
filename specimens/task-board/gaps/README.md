# Candidate-informed task-board gaps

These five expectations, confirmed by the owner on October 31, are evaluated against a copied task-board fixture with `runs/task-board-wonder-fix.patch` applied. Run `./specimens/task-board/gaps/prepare.sh` first; the patch is a local, ignored run artifact and must be supplied separately on a clean checkout. The original fixture is not changed. The generated `source/` is ignored.

The local proxy injects HTTP 500 responses for task loading or completion in the relevant cases. It is test-only infrastructure, not application behavior or a claim about production. T5 sends a second completion request after the UI confirms the first, then reopens the page.

All five accepted runs passed against the candidate-informed baseline, so no designated behavior was reproduced under these conditions. The initial runs before the baseline patch was properly applied are invalid for this evaluation. No independently correct controls, qualified decoys, or held-out evaluation were used.
