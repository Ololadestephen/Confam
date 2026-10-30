# Review notes: booking-integrity checks

Checks are drafted by Muse Spark. The developer reviews them for validity before they run. Spark's drafts are kept unedited next to the reviewed versions.

## Case history

1. `workflow-v1-spark.json`: Spark draft for four expectations. Run unedited. Development decoys: 4 caught, 1 survived (wrong-time), 1 uncounted (browser-only).
2. Live strengthening (Spark) returned the checks unchanged and flagged that catching wrong-time needs a new expectation about the booked time. The owner approved a fifth expectation, `bookedTimeShown`: "The listed appointment shows the date and time that was booked." The wrong-time decoy was mapped to it, because that is the expectation it violates.
3. `workflow-v2-spark.json`: new Spark draft for all five expectations.
4. `workflow-v2-reviewed.json`: the v2 draft blocked at the correct-fix gate (both correct fixes failed, the original timed out). Four validity corrections were made before any decoy ran against v2:
   - Wait for the status message to appear (`#booking-status:not(:empty)`) before reading it. The draft read it while still empty.
   - Wait for the appointments list to finish loading (`aria-busy="false"`) instead of for the page heading, which appears before the list loads.
   - Assert `appointmentPersists` immediately after counting the list, before reading the list text. Otherwise the original app times out waiting for a list item instead of failing on the reported problem.
   - Expected text `Sat 5 Jan · 2:00 PM — Box braids`: the draft inserted a comma that the page never renders.

No assertion was removed or weakened, and no expectation was changed by these corrections.
