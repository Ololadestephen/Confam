// The app's existing smoke test. It passes even with the persistence bug,
// because it only checks the confirmation message.

import { expect, test } from '@playwright/test';

test('customer can book an appointment', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Phone number').fill('08030000101');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Date').fill('2026-12-05');
  await page.getByLabel('Time').selectOption({ label: '2:00 PM' });
  await page.getByRole('button', { name: 'Book appointment' }).click();

  await expect(page.getByRole('status')).toHaveText('Booking confirmed');
});
