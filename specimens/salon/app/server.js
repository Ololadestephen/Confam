import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDatabase } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4310);
const db = openDatabase(process.env.DB_PATH ?? path.join(here, 'salon.sqlite'));

const SLOTS = ['9:00 AM', '10:30 AM', '12:00 PM', '2:00 PM', '3:30 PM', '5:00 PM'];

const app = express();
app.use(express.json());
app.use(express.static(path.join(here, 'public')));

function readCookie(req, name) {
  const pairs = (req.headers.cookie ?? '').split(';').map((part) => part.trim().split('='));
  const found = pairs.find(([key]) => key === name);
  return found ? decodeURIComponent(found[1]) : undefined;
}

function currentCustomer(req) {
  const id = Number(readCookie(req, 'customer'));
  return Number.isInteger(id) ? db.findCustomer(id) : undefined;
}

// "2:00 PM" on "2026-10-31" -> "2026-10-31T14:00"
function toStartsAt(date, timeLabel) {
  const [clock, period] = timeLabel.split(' ');
  const [hour, minute] = clock.split(':');
  const hour24 = period === 'PM' && hour !== '12' ? hour + 12 : hour;
  return `${date}T${String(hour24).padStart(2, '0')}:${minute}`;
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/session', (req, res) => {
  const customer = db.findCustomerByPhone(String(req.body?.phone ?? '').trim());
  if (!customer) return res.status(404).json({ error: 'We could not find that phone number.' });
  res.cookie('customer', String(customer.id), { httpOnly: true, sameSite: 'lax' });
  res.json({ customer });
});

app.delete('/api/session', (_req, res) => {
  res.clearCookie('customer');
  res.status(204).end();
});

app.get('/api/me', (req, res) => {
  const customer = currentCustomer(req);
  if (!customer) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ customer });
});

app.get('/api/services', (_req, res) => res.json({ services: db.listServices() }));

app.get('/api/slots', (_req, res) => res.json({ slots: SLOTS }));

app.get('/api/appointments', (req, res) => {
  const customer = currentCustomer(req);
  if (!customer) return res.status(401).json({ error: 'Please sign in first.' });
  res.json({ appointments: db.listAppointments(customer.id) });
});

app.post('/api/appointments', (req, res) => {
  const customer = currentCustomer(req);
  if (!customer) return res.status(401).json({ error: 'Please sign in first.' });

  const { serviceId, date, time } = req.body ?? {};
  const appointment = {
    customerId: customer.id,
    serviceId: Number(serviceId),
    startsAt: toStartsAt(date, time),
  };

  try {
    db.addAppointment(appointment);
  } catch (error) {
    console.error('Could not save appointment:', error.message);
  }

  res.status(201).json({ status: 'confirmed', appointment });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Salon app listening on http://127.0.0.1:${port}`);
});
