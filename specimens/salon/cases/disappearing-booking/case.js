// Shared facts for the "disappearing booking" case, used by the reproduction
// test and by the oracle probes so both talk about the same booking.

export const bookingCase = {
  customer: { name: 'Adaeze Okafor', phone: '08030000101' },
  otherCustomer: { name: 'Tunde Bakare', phone: '08030000102' },
  service: 'Box braids',
  slotLabel: '2:00 PM',
  slot24: '14:00',
};

// The next Saturday after `from`, as YYYY-MM-DD in local time.
export function upcomingSaturday(from = new Date()) {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const daysAhead = ((6 - date.getDay() + 7) % 7) || 7;
  date.setDate(date.getDate() + daysAhead);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function caseStartsAt(date = upcomingSaturday()) {
  return `${date}T${bookingCase.slot24}`;
}
