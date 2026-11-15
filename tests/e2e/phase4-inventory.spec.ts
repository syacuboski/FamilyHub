// Phase 4: Inventory — locations, reconcile, edit, low → Grocery, diaper bag.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('inventory shows low items per location and sends them to Grocery', async ({ page }) => {
  await signIn(page);
  await page.goto('/home/inventory?loc=fridge');
  await expect(page.getByRole('tab', { name: /Fridge/ })).toContainText('2 low');
  await expect(page.locator('.inv-row', { hasText: 'Lemons' })).toContainText('Out');
  await expect(page.locator('.inv-row', { hasText: 'Whole milk' })).toContainText(/Use by/);
  // milk and lemons are already on the sample Grocery list, so there's nothing to add here
  await expect(page.getByRole('button', { name: /low items? to Grocery/ })).toHaveCount(0);
  await page.getByRole('tab', { name: /Pantry/ }).click();
  await page.getByRole('button', { name: 'Add 1 low item to Grocery' }).click();
  await expect(page.locator('.toast')).toContainText('Added 1 item to Grocery');
  await page.goto('/lists');
  await expect(page.locator('.list-row', { hasText: 'Olive oil' })).toContainText('Running low');
});

test('reconcile counts, then edit an item', async ({ page }) => {
  await signIn(page);
  await page.goto('/home/inventory?loc=pantry');
  await expect(page.getByText('Pantry last checked never')).toBeVisible();
  await page.getByRole('button', { name: 'Reconcile', exact: true }).click();
  await page.getByRole('button', { name: 'One more Rice' }).click();
  await page.getByRole('button', { name: 'Pasta count is right' }).click();
  await page.getByRole('button', { name: 'Stop tracking Dried oregano' }).click();
  await expect(page.getByText('2 of 5 checked · 2 changed')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Pantry last checked today')).toBeVisible();
  await expect(page.locator('.inv-row', { hasText: 'Rice' })).toContainText('3');
  await expect(page.locator('.inv-row', { hasText: 'Dried oregano' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit Canned beans' }).click();
  await page.getByLabel('Running low at').fill('8');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.inv-row', { hasText: 'Canned beans' })).toContainText('Low');
});

test('add stock and use the diaper bag checklist', async ({ page }) => {
  await signIn(page);
  await page.goto('/home/inventory?loc=kids');
  await page.getByLabel('Add an item to Kids').fill('Teething gel 2 tubes');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.inv-row', { hasText: 'Teething gel' })).toContainText('2');

  const bag = page.getByRole('region', { name: 'Diaper bag' });
  await expect(bag.locator('.bag-row', { hasText: 'Wipes' })).toContainText(/On list|Restock/);
  await bag.locator('.bag-row', { hasText: 'Burp cloth' }).getByRole('checkbox').click();
  await expect(bag).toContainText('1 of 7 packed');
  await bag.getByRole('button', { name: 'Unpack all' }).click();
  await expect(bag).toContainText('0 of 7 packed');
});
