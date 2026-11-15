// Phase 1–2 flows: sign-in, live shared lists, offline edits, tasks, calendar.
import { expect, test } from '@playwright/test';
import { DAD, MOM, newPhone, signIn } from './helpers';

test('wrong password shows a friendly error', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(DAD.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText("don't match");
});

test('Today shows tonight’s dinner, events and tasks', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening|night), Dad/);
  await expect(page.getByRole('link', { name: /Sheet-pan lemon chicken/ })).toBeVisible();
  await expect(page.getByText('Pediatrician check-up')).toBeVisible();
  await expect(page.getByText('Restock the diaper bag')).toBeVisible();
});

test('a list check-off on one phone shows up live on the other', async ({ browser }) => {
  const dad = await newPhone(browser, DAD);
  const mom = await newPhone(browser, MOM);
  await dad.page.goto('/lists');
  await mom.page.goto('/lists');
  await expect(mom.page.getByText('Bananas')).toBeVisible();

  // Dad adds an item → Mom sees it without reloading
  await dad.page.getByLabel('Add an item').fill('Maple syrup 2');
  await dad.page.getByRole('button', { name: 'Add item' }).click();
  await expect(mom.page.getByText('Maple syrup')).toBeVisible({ timeout: 10_000 });

  // Mom checks Bananas → Dad sees it move to "In the cart"
  await mom.page.locator('.list-row', { hasText: 'Bananas' }).getByRole('checkbox').click();
  const cart = dad.page.locator('.list-group', { hasText: 'In the cart' });
  await expect(cart.getByText('Bananas')).toBeVisible({ timeout: 10_000 });
  await dad.ctx.close();
  await mom.ctx.close();
});

test('changes made offline sync when the phone reconnects', async ({ browser }) => {
  const dad = await newPhone(browser, DAD);
  const mom = await newPhone(browser, MOM);
  await dad.page.goto('/lists');
  await mom.page.goto('/lists');
  await expect(dad.page.getByText('Greek yogurt')).toBeVisible();

  await dad.ctx.setOffline(true);
  await dad.page.getByLabel('Add an item').fill('Batteries AA');
  await dad.page.getByRole('button', { name: 'Add item' }).click();
  await dad.page.locator('.list-row', { hasText: 'Greek yogurt' }).getByRole('checkbox').click();
  await expect(dad.page.getByText(/Offline · \d+ changes? waiting/)).toBeVisible();
  // nothing reached Mom yet
  await mom.page.waitForTimeout(1000);
  await expect(mom.page.getByText('Batteries AA')).toHaveCount(0);

  await dad.ctx.setOffline(false);
  await dad.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(mom.page.getByText('Batteries AA')).toBeVisible({ timeout: 15_000 });
  await expect(mom.page.locator('.list-group', { hasText: 'In the cart' }).getByText('Greek yogurt')).toBeVisible({ timeout: 15_000 });
  await expect(dad.page.getByText(/synced/)).toBeVisible({ timeout: 15_000 });
  await dad.ctx.close();
  await mom.ctx.close();
});

test('the list keeps working after a reload with no connection', async ({ browser }) => {
  const dad = await newPhone(browser, DAD);
  await dad.page.goto('/lists');
  await expect(dad.page.getByText('Whole milk')).toBeVisible();
  await dad.ctx.setOffline(true);
  await dad.page.evaluate(() => window.dispatchEvent(new Event('offline')));
  // client-side navigation while offline still renders from IndexedDB
  await dad.page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await dad.page.getByRole('link', { name: 'Lists', exact: true }).click();
  await expect(dad.page.getByText('Whole milk')).toBeVisible();
  await dad.ctx.setOffline(false);
  await dad.ctx.close();
});

test('a recurring chore rolls forward when ticked, with undo', async ({ page }) => {
  await signIn(page);
  await page.goto('/home/tasks');
  const row = page.locator('.task-row', { hasText: 'Trash & recycling' });
  await expect(row).toContainText('next today');
  await row.getByRole('checkbox').click();
  await expect(page.locator('.toast')).toContainText('Done · next');
  await expect(page.locator('.task-row', { hasText: 'Trash & recycling' })).not.toContainText('next today');
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.task-row', { hasText: 'Trash & recycling' })).toContainText('next today');
});

test('create a weekly event, see it next week, skip one date', async ({ page }) => {
  await signIn(page);
  const d = new Date();
  d.setDate(d.getDate() + 2);
  const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  await page.goto(`/calendar/new?date=${ymd(d)}`);
  await page.getByLabel('Event').fill('Piano lesson');
  await page.getByLabel('Starts').fill('16:00');
  await expect(page.getByLabel('Ends')).toHaveValue('17:00');
  await page.getByLabel('Repeats').selectOption('weekly');
  await page.getByRole('button', { name: 'Mom' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.toast')).toContainText('Added Piano lesson');

  const next = new Date(d);
  next.setDate(next.getDate() + 7);
  await page.goto(`/calendar?d=${ymd(next)}`);
  const card = page.locator('.agenda-card', { hasText: 'Piano lesson' });
  await expect(card).toContainText('Mom');
  await expect(card).toContainText('4:00');
  await card.click();
  await page.getByRole('button', { name: /Skip just/ }).click();
  await page.getByRole('button', { name: 'Skip it' }).click();
  await expect(page.locator('.toast')).toContainText('Skipped');
  await expect(page).not.toHaveURL(/event/);
  await page.goto(`/calendar?d=${ymd(next)}`);
  await expect(page.locator('.agenda-card', { hasText: 'Piano lesson' })).toHaveCount(0);
  const after = new Date(next);
  after.setDate(after.getDate() + 7);
  await page.goto(`/calendar?d=${ymd(after)}`);
  await expect(page.locator('.agenda-card', { hasText: 'Piano lesson' })).toBeVisible();
});

test('quick add understands “Milk 2 gal” and plain-language events', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Quick add' }).click();
  await page.getByLabel('What do you need?').fill('Oat milk 2 gal');
  await expect(page.getByText('Understood: Oat milk · 2 gal · Dairy')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Add to list' }).click();
  await expect(page.locator('.toast')).toContainText('Added Oat milk');
  await page.goto('/lists');
  await expect(page.locator('.list-row', { hasText: 'Oat milk' })).toContainText('2 gal');

  await page.getByRole('link', { name: 'Quick add' }).click();
  await page.getByRole('tab', { name: 'Event' }).click();
  await page.getByLabel('Event').fill('Flu shots tomorrow at 10am');
  await expect(page.getByText(/Understood: Flu shots · .* · 10:00 AM–11:00 AM/)).toBeVisible();
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  await expect(page.locator('.toast')).toContainText('Added Flu shots');
  const t = new Date();
  t.setDate(t.getDate() + 1);
  await page.goto(`/calendar?d=${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
  await expect(page.getByText('Flu shots')).toBeVisible();
});

test('theme can be switched to Night Court', async ({ page }) => {
  await signIn(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Night Court' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.getByRole('button', { name: 'Day Court' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
});
