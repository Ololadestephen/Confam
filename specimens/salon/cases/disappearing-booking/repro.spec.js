// Hand-written reproduction for the "disappearing booking" report.
// Assertion messages carry the expectation they check ([E1], [E2]) so the
// reproduction gate can confirm the original fails for the reported reason.

import { expect, test } from '@playwright/test';
import { bookingCase, upcomingSaturday } from './case.js';

async function signIn(page, phone) {
  await page.goto('/');
  await page.getByLabel('Phone number').fill(phone);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#appointments')).toHaveAttribute('aria-busy', 'false');
}

function caseBooking(page) {
  return page
    .getByRole('listitem')
    .filter({ hasText: bookingCase.service })
    .filter({ hasText: bookingCase.slotLabel });
}

test('a confirmed Saturday 2:00 PM booking is still there after reopening the page', async ({ browser }) => {
  const customerContext = await browser.newContext();
  const page = await customerContext.newPage();
  await signIn(page, bookingCase.customer.phone);

  const serviceValue = await page
    .locator('#service option', { hasText: bookingCase.service })
    .getAttribute('value');
  await page.getByLabel('Service').selectOption(serviceValue);
  await page.getByLabel('Date').fill(upcomingSaturday());
  await page.getByLabel('Time').selectOption({ label: bookingCase.slotLabel });
  await page.getByRole('button', { name: 'Book appointment' }).click();

  // The customer saw a confirmation. This is the report's starting point, not an expectation.
  await expect(page.getByRole('status')).toHaveText('Booking confirmed');

  // Reopen the page, as the customer did.
  await page.close();
  const reopened = await customerContext.newPage();
  await reopened.goto('/');
  await expect(reopened.locator('#appointments')).toHaveAttribute('aria-busy', 'false');
  await expect(
    caseBooking(reopened),
    '[E1] the confirmed appointment is still listed after reopening the page',
  ).toHaveCount(1);

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, bookingCase.otherCustomer.phone);
  await expect(
    caseBooking(otherPage),
    '[E2] the appointment does not appear under another customer',
  ).toHaveCount(0);

  await customerContext.close();
  await otherContext.close();
});
