import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('Auth flows', () => {
  test('happy path: user logs in and lands in workflows page', async ({ page }) => {
    test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run real login flow');

    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.locator('#login-submit').click();

    await expect(page).toHaveURL(/\/workflows$/);
    await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();
  });

  test('malformed input path: auth endpoint error is surfaced to user', async ({ page }) => {
    await page.route('**/api/auth/**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Malformed credentials payload' }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('bad@example.com');
    await page.getByLabel('Password').fill('bad-password');
    await page.locator('#login-submit').click();

    await expect(page.getByText(/malformed|login failed/i)).toBeVisible();
  });

  test('chaotic path: network failure keeps form interactive', async ({ page }) => {
    await page.route('**/api/auth/**', async (route) => {
      await route.abort('failed');
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('chaos@example.com');
    await page.getByLabel('Password').fill('chaos-password');
    await page.locator('#login-submit').click();

    await expect(page.locator('#login-submit')).toBeEnabled();
    await expect(page).toHaveURL(/\/login$/);
  });
});
