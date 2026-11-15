// Phase 3, first part (Checkpoint B): recipe entry and Our Cookbook.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('enter a recipe by pasting a list, with a photo, then edit it', async ({ page }) => {
  await signIn(page);
  await page.goto('/recipes');
  await page.getByRole('link', { name: '+ New recipe' }).click();

  await page.getByLabel('Recipe name').fill('Weeknight tacos');
  await page.getByLabel('Portions', { exact: true }).fill('4');
  await page.getByLabel('Cook (min)').fill('25');

  // paste a whole list into the first ingredient box
  await page.getByLabel('Ingredient 1', { exact: true }).focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '1 lb ground beef\n8 taco shells\n1 cup cheddar, shredded');
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByLabel('Ingredient 3', { exact: true })).toHaveValue('Cheddar, shredded');
  await expect(page.getByLabel('Unit 1', { exact: true })).toHaveValue('lb');

  await page.getByLabel('Step 1', { exact: true }).fill('Brown the beef.');
  await page.getByRole('button', { name: '+ Add step' }).click();
  await page.getByLabel('Step 2', { exact: true }).fill('Fill the shells and top with cheese.');
  await page.locator('.tag-picker').getByRole('button', { name: 'Dinner' }).click();
  await page.getByLabel('Protein (g)').fill('25');
  await page.getByLabel('Carbs (g)').fill('20');
  await page.getByLabel('Fat (g)').fill('18');
  await expect(page.getByText('342 cal')).toBeVisible();

  // a small generated photo
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBmhNBMDAwA3+gP9pV8jAgAAAABJRU5ErkJggg==', 'base64');
  await page.getByLabel('Recipe photo').setInputFiles({ name: 'tacos.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Add to Our Cookbook' }).click();
  await expect(page.locator('.toast')).toContainText('Added Weeknight tacos');

  // it's in the cookbook, searchable by ingredient, with its photo
  await page.getByLabel('Search recipes').fill('cheddar');
  const card = page.locator('a.recipe-card', { hasText: 'Weeknight tacos' });
  await expect(card).toBeVisible();
  await expect(card.locator('img.thumb')).toBeVisible();
  await card.click();
  await expect(page.locator('.ing-line', { hasText: 'Taco shells' })).toContainText('8');
  await expect(page.getByText('25 min')).toBeVisible();

  // edit: change an amount and remove a row
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Amount 2', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Remove ingredient 3' }).click();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.locator('.ing-line', { hasText: 'Taco shells' })).toContainText('10');
  await expect(page.locator('.ing-line', { hasText: 'Cheddar' })).toHaveCount(0);
});

test('cookbook categories can be hidden and filtered', async ({ page }) => {
  await signIn(page);
  await page.goto('/recipes');
  await page.getByRole('button', { name: 'Breakfast', exact: true }).click();
  await expect(page.locator('a.recipe-card', { hasText: 'Eggs & toast' })).toBeVisible();
  await expect(page.locator('a.recipe-card', { hasText: 'Turkey chili' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('.cat-row', { hasText: 'Lunch' }).getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Filter by tag' }).getByRole('button', { name: 'Lunch', exact: true })).toHaveCount(0);
});
