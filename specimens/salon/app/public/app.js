const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = response.status === 204 ? {} : await response.json();
  return { ok: response.ok, body };
}

function formatDay(date) {
  return new Date(`${date}T00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// "2026-10-31T14:00" -> { date: "2026-10-31", time: "2:00 PM" }
function splitStartsAt(startsAt) {
  const [date, clock] = startsAt.split('T');
  const [hour, minute] = clock.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return { date, time: `${hour12}:${String(minute).padStart(2, '0')} ${period}` };
}

function renderAppointment({ serviceName, date, time }) {
  const item = document.createElement('li');
  item.textContent = `${formatDay(date)} · ${time} — ${serviceName}`;
  $('#appointments').append(item);
  $('#no-appointments').hidden = true;
}

async function loadAppointments() {
  $('#appointments').setAttribute('aria-busy', 'true');
  const { body } = await api('/api/appointments');
  $('#appointments').replaceChildren();
  $('#no-appointments').hidden = body.appointments.length > 0;
  for (const appointment of body.appointments) {
    renderAppointment({ serviceName: appointment.serviceName, ...splitStartsAt(appointment.startsAt) });
  }
  $('#appointments').setAttribute('aria-busy', 'false');
}

async function loadBookingForm() {
  const [{ body: services }, { body: slots }] = await Promise.all([
    api('/api/services'),
    api('/api/slots'),
  ]);
  $('#service').replaceChildren(
    ...services.services.map((s) => new Option(`${s.name} · ₦${s.priceNaira.toLocaleString()}`, s.id)),
  );
  $('#time').replaceChildren(...slots.slots.map((slot) => new Option(slot, slot)));
}

async function showBooking(customer) {
  $('#customer-name').textContent = customer.name;
  $('#account').hidden = false;
  $('#sign-in').hidden = true;
  $('#booking').hidden = false;
  await Promise.all([loadBookingForm(), loadAppointments()]);
}

function showSignIn() {
  $('#account').hidden = true;
  $('#booking').hidden = true;
  $('#sign-in').hidden = false;
}

$('#sign-in-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const { ok, body } = await api('/api/session', {
    method: 'POST',
    body: JSON.stringify({ phone: $('#phone').value }),
  });
  if (!ok) {
    $('#sign-in-error').textContent = body.error;
    return;
  }
  $('#sign-in-error').textContent = '';
  await showBooking(body.customer);
});

$('#sign-out').addEventListener('click', async () => {
  await api('/api/session', { method: 'DELETE' });
  showSignIn();
});

$('#booking-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const service = $('#service');
  const booking = { serviceId: service.value, date: $('#date').value, time: $('#time').value };
  const { ok, body } = await api('/api/appointments', {
    method: 'POST',
    body: JSON.stringify(booking),
  });
  if (!ok) {
    $('#booking-status').textContent = body.error ?? 'Something went wrong. Please try again.';
    return;
  }
  $('#booking-status').textContent = 'Booking confirmed';
  renderAppointment({
    serviceName: service.selectedOptions[0].text.split(' · ')[0],
    date: booking.date,
    time: booking.time,
  });
});

const { ok, body } = await api('/api/me');
if (ok) await showBooking(body.customer);
else showSignIn();
