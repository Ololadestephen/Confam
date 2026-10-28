# Case: disappearing booking

## Customer report

> "I booked Saturday at 2 p.m. It said confirmed, but when I reopened the page, my appointment was gone."
>
> — Adaeze Okafor (fictional customer), phone 08030000101

## Expected behavior (to be confirmed by the developer)

| ID | Expectation |
|---|---|
| E1 | After a booking is confirmed and the page is reopened, the appointment is still listed. |
| E2 | The appointment appears under the customer who booked it, and not under any other customer. |
| E3 | "Booking confirmed" is shown only when the booking has actually been saved. |
| E4 | A saved appointment is still there after the server restarts. |

## Files

- `case.js` — shared facts (customer, service, slot, date) used by the test and the probes
- `repro.spec.js` — hand-written reproduction. On the original app it must fail on `[E1]`.
