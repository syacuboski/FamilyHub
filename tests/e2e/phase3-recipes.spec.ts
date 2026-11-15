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
  // the page scales to 2 adults + 1 kid = 2½ of 4 portions: 8 shells → 5
  await expect(page.locator('.ing-line', { hasText: 'Taco shells' })).toContainText('5');
  await expect(page.getByText('25 min')).toBeVisible();

  // edit: change an amount and remove a row
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Amount 2', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Remove ingredient 3' }).click();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.locator('.ing-line', { hasText: 'Taco shells' })).toContainText('6¼'); // 10 × 2½/4
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

test('the scaler, cook mode and prep labels follow the same plan', async ({ page }) => {
  await signIn(page);
  await page.goto('/recipes');
  await page.locator('a.recipe-card', { hasText: 'Sheet-pan lemon chicken' }).click();
  // 2 adults + 1 kid (½) = 2½ of 4 portions → 2 lb chicken becomes 1¼ lb
  await page.getByRole('button', { name: 'Fewer adults' }).click();
  await page.getByRole('button', { name: 'More adults' }).click();
  await expect(page.locator('.scale-summary')).toContainText('Tonight 2½');
  await expect(page.locator('.ing-line', { hasText: 'Chicken thighs' })).toContainText('1¼ lb');
  await page.getByLabel('Adult portions').fill('4');
  await expect(page.locator('.scale-summary')).toContainText('6½ portions');
  await expect(page.locator('.ing-line', { hasText: 'Chicken thighs' })).toContainText('3¼ lb');
  await expect(page.getByRole('link', { name: 'Print 4 meal prep labels' })).toBeVisible();

  await page.getByRole('link', { name: 'Cook mode' }).click();
  await expect(page.getByText('Scaled for 2 adults + 1 kid + 4 prep · 6½ portions')).toBeVisible();
  await expect(page.locator('.mise-row', { hasText: 'Chicken thighs' })).toContainText('3¼ lb');
  await page.getByRole('button', { name: 'Step 2 ›' }).click();
  await expect(page.locator('.mise-row.now', { hasText: 'Baby potatoes' })).toBeVisible();
  // this step's ingredients are listed first
  await expect(page.locator('.cook .panel-body .mise-group').first()).toHaveText('For step 2');
  await expect(page.locator('.cook .panel-body .mise-row').first()).toHaveClass(/now/);
  await page.getByRole('button', { name: 'Start 15:00 timer' }).click();
  await expect(page.getByRole('button', { name: /14:5\d left/ })).toBeVisible();
  await page.locator('.mise-row', { hasText: 'Garlic' }).getByRole('checkbox').check();
  await expect(page.getByText('1 of 7 ready')).toBeVisible();

  await page.goBack();
  await page.getByRole('link', { name: 'Print 4 meal prep labels' }).click();
  await expect(page.locator('.label-preview').first()).toContainText('Adult portion · 1 of 4');
  await expect(page.locator('.label-preview').first()).toContainText('368 cal');
  await expect(page.locator('.print-sheet .label-preview')).toHaveCount(4);
});

test('plan a dinner from the Meals week and open it with that headcount', async ({ page }) => {
  await signIn(page);
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.goto(`/meals?d=${ymd}`);
  await page.locator('.day-card.front button.slot', { hasText: 'Dinner' }).click();
  await page.getByRole('dialog').getByLabel(/What's for dinner/).selectOption({ label: 'Turkey chili' });
  await page.getByRole('dialog').getByRole('button', { name: 'More kids' }).click();
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Add missing ingredients to Grocery' }).uncheck();
  await page.getByRole('dialog').getByRole('button', { name: /Add to menu|Save/ }).click();
  const slot = page.locator('.day-card.front button.slot', { hasText: 'Dinner' });
  await expect(slot).toContainText('Turkey chili');
  await slot.click();
  await page.getByRole('dialog').getByRole('link', { name: /Open the recipe/ }).click();
  await expect(page.locator('.scale-summary')).toContainText('Tonight 3'); // 2 adults + 2 kids at ½
});
