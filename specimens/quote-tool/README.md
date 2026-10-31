# Quote tool fixture

All material in this directory is authored fictional fixture material. This small Node builtins-only HTTP application stores one quote using the configured state file. Its original source intentionally retains a stale total after quantity changes and accepts invalid quantities. The quantity and invalid-input cases are ordinary verification fixtures with no correct controls or independent probes; a passing candidate does not calibrate false rejections.

`patches/good.patch` repairs both defects; `patches/faulty.patch` recalculates the total but still accepts invalid quantities. These are candidate fixtures, not independently established correct controls. `case-nonreproduction.json` and its workflow assert an existing behavior, so the original should pass and the reproduction gate should stop candidate evaluation. Pair that case with `workflow-unsupported.json` to exercise the explicit unsupported restart capability before execution. These are intended outcomes, not execution results.

`case-saved-total.json` checks the saved quote (GET /quote) rather than the update response. The original keeps a stale total of 12. Both candidate patches recalculate the total, so both pass this case; the faulty patch's defect is input validation, which this case does not test.

The repository's CI uses `case-invalid.json` with both patches to exercise the reusable review action. On pull requests, the correct patch's review is also posted as a comment.
