# Salon specimen

A fictional Lagos salon booking app (Adunni Hair Studio, Yaba) used as a target for Confam.

**The bug in `app/` is intentional.** Afternoon bookings show "Booking confirmed" but are never saved:

- `toStartsAt` in `app/server.js` adds `12` to the hour while it is still a string, so `"2" + 12` becomes `"212"`.
- The database's `CHECK` constraint rejects the malformed time.
- The handler swallows the error and responds `201 confirmed` anyway, and the page adds the booking to its own list.

Morning bookings and 12:00 PM work, so the app looks healthy, and its existing smoke test passes.

## Layout

| Path | What |
|---|---|
| `app/` | The app (Express + `node:sqlite`) and its existing smoke test |
| `cases/` | Bug reports and hand-written reproductions |
| `controls/` | Two correct fixes built in different ways, as patches against `app/` |
| `probes/` | Human-curated oracle probes that observe the database and API directly |
| `scripts/verify.mjs` | Checks the original, both controls and the probes behave as expected |

## Commands (from the repository root)

```bash
npm run salon
```

```bash
npm run salon:verify
```

## The controls

| Control | Approach |
|---|---|
| A — server parsing | Converts the hour to a number before the 12-hour → 24-hour conversion; returns an error instead of a false confirmation. |
| B — 24-hour slots and reload | Slots carry 24-hour values so the server never parses labels; validates input; returns an error on failure; the page reloads appointments from the server instead of trusting its own list. |
