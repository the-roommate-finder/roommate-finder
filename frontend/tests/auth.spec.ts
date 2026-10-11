import { test, expect } from '@playwright/test';

test('role selection preserves the selected role on signup', async ({ page }) => {
  await page.goto('/role-selection');
  await page.getByText('List a Property', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/signup\?role=lister/);
  await expect(page.getByText('Creating account as a Property Lister')).toBeVisible();
});

test('signup validates confirmation then submits the role and shows verification', async ({ page }) => {
  await page.goto('/signup?role=lister');
  await page.getByLabel('Full Name').fill('Test Person');
  await page.getByLabel('Email', { exact: true }).fill('test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm Password').fill('Different123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.form-feedback[role=alert]')).toHaveText('Your passwords must match.');
  await page.getByLabel('Password', { exact: true }).fill('Abc123');
  await page.getByLabel('Confirm Password').fill('Abc123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.form-feedback[role=alert]')).toHaveText('Use 6–50 characters with an uppercase letter, a lowercase letter, a number, and a special character.');
  await page.getByLabel('Password', { exact: true }).fill('Abc1!x');
  await page.getByLabel('Confirm Password').fill('Abc1!x');
  await page.route('**/api/auth/register', async route => {
    expect(route.request().postDataJSON()).toEqual({ email: 'test@example.com', password: 'Abc1!x', display_name: 'Test Person', role: 'lister' });
    await route.fulfill({ status: 201, headers: { 'Set-Cookie': 'rmf_verification_email=test@example.com; Path=/; HttpOnly; SameSite=Lax' }, json: { id: 'test', email: 'test@example.com' } });
  });
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByRole('group', { name: 'Email verification code' })).toBeVisible();
  await expect(page.getByLabel('Confirm Password')).toHaveCount(0);
});

test('login handles errors and password visibility without storing tokens in localStorage', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: { message: 'Invalid credentials.' } }));
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.locator('.form-feedback[role=alert]')).toHaveText('Invalid credentials.');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

for (const width of [1440, 390]) {
  test(`screens fit at ${width}px and preserve reserved asset spaces`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/role-selection', '/signup', '/login', '/preview/room-card']) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      await expect(page.locator('[data-asset-slot]').first()).toBeVisible();
      await page.screenshot({ path: `/tmp/roommate-${path.replaceAll('/', '-')}-${width}.png`, fullPage: true });
    }
  });
}
