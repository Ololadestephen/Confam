// Oracle probes for the salon specimen.
//
// Human-curated. Decoy generators may choose a probe to confirm their declared
// violation; they never write one. Probes observe the app independently of the
// checks under evaluation: the database directly, or the API after a restart.
//
// Every probe takes:
//   ctx     { dbPath, baseUrl, restartApp(): Promise<void> }
//   subject { customerPhone, service, startsAt }   startsAt is "YYYY-MM-DDTHH:MM"
// and returns { holds: boolean, observed: object }.

import { DatabaseSync } from 'node:sqlite';

function matchingRows(dbPath, { service, startsAt }) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db
      .prepare(`
        SELECT a.id, a.starts_at AS startsAt, s.name AS service, c.phone AS customerPhone
        FROM appointments a
        JOIN services s ON s.id = a.service_id
        JOIN customers c ON c.id = a.customer_id
        WHERE s.name = ? AND a.starts_at = ?
      `)
      .all(service, startsAt);
  } finally {
    db.close();
  }
}

async function signedInFetch(baseUrl, phone) {
  const session = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const cookie = session.headers.get('set-cookie')?.split(';')[0] ?? '';
  return (path) => fetch(`${baseUrl}${path}`, { headers: { cookie } });
}

export const probes = {
  'appointment-saved': {
    description: 'A row for this service and start time exists in the appointments table.',
    async run(ctx, subject) {
      const rows = matchingRows(ctx.dbPath, subject);
      return { holds: rows.length > 0, observed: { rows } };
    },
  },

  'appointment-owned-by-customer': {
    description: 'The saved appointment exists and belongs only to the customer who booked it.',
    async run(ctx, subject) {
      const rows = matchingRows(ctx.dbPath, subject);
      const holds = rows.length > 0 && rows.every((row) => row.customerPhone === subject.customerPhone);
      return { holds, observed: { rows } };
    },
  },

  'appointment-survives-restart': {
    description: 'After the server restarts, the customer still gets the appointment from the API.',
    async run(ctx, subject) {
      await ctx.restartApp();
      const get = await signedInFetch(ctx.baseUrl, subject.customerPhone);
      const { appointments = [] } = await (await get('/api/appointments')).json();
      const found = appointments.filter(
        (a) => a.serviceName === subject.service && a.startsAt === subject.startsAt,
      );
      return { holds: found.length > 0, observed: { appointments } };
    },
  },
};
