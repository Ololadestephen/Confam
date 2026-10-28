import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    price_naira INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    starts_at TEXT NOT NULL
      CHECK (starts_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]'),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

// Fictional people and numbers.
const CUSTOMERS = [
  { name: 'Adaeze Okafor', phone: '08030000101' },
  { name: 'Tunde Bakare', phone: '08030000102' },
  { name: 'Zainab Musa', phone: '08030000103' },
];

const SERVICES = [
  { name: 'Box braids', minutes: 240, priceNaira: 25000 },
  { name: 'Silk press', minutes: 90, priceNaira: 15000 },
  { name: 'Cornrows', minutes: 120, priceNaira: 12000 },
  { name: 'Wash and treatment', minutes: 60, priceNaira: 8000 },
];

export function openDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  seed(db);

  const statements = {
    customerById: db.prepare('SELECT id, name, phone FROM customers WHERE id = ?'),
    customerByPhone: db.prepare('SELECT id, name, phone FROM customers WHERE phone = ?'),
    services: db.prepare(
      'SELECT id, name, minutes, price_naira AS priceNaira FROM services ORDER BY id',
    ),
    appointmentsFor: db.prepare(`
      SELECT a.id, a.starts_at AS startsAt, s.name AS serviceName
      FROM appointments a JOIN services s ON s.id = a.service_id
      WHERE a.customer_id = ?
      ORDER BY a.starts_at
    `),
    addAppointment: db.prepare(
      'INSERT INTO appointments (customer_id, service_id, starts_at) VALUES (?, ?, ?)',
    ),
  };

  return {
    findCustomer: (id) => statements.customerById.get(id),
    findCustomerByPhone: (phone) => statements.customerByPhone.get(phone),
    listServices: () => statements.services.all(),
    listAppointments: (customerId) => statements.appointmentsFor.all(customerId),
    addAppointment: ({ customerId, serviceId, startsAt }) =>
      statements.addAppointment.run(customerId, serviceId, startsAt),
  };
}

function seed(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM customers').get();
  if (count > 0) return;

  const addCustomer = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)');
  for (const c of CUSTOMERS) addCustomer.run(c.name, c.phone);

  const addService = db.prepare(
    'INSERT INTO services (name, minutes, price_naira) VALUES (?, ?, ?)',
  );
  for (const s of SERVICES) addService.run(s.name, s.minutes, s.priceNaira);
}
