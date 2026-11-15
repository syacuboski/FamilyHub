import { expect, type Browser, type Page } from '@playwright/test';
import seed from './seed.dev.json' with { type: 'json' };

export const DAD = seed.users[0];
export const MOM = seed.users[1];

export async function signIn(page: Page, who = DAD) {
  await page.goto('/');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  // wait for the first sync so local data is there
  await expect(page.getByText(/synced|Syncing/).first()).toBeVisible({ timeout: 10_000 }).catch(() => {});
}

export async function newPhone(browser: Browser, who = DAD) {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5174', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await signIn(page, who);
  return { ctx, page };
}
