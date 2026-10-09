import { test, expect } from '@playwright/test';

// Fixtures are used only by browser tests. Production always requests /api/listings.
const listing = {
  id: 'a-real-api-id', title: 'Sunny room near the university', address: '12 Rumuola Road', city: 'Port Harcourt', state: 'Rivers', country: 'Nigeria',
  description: 'A spacious room with natural light and secure parking.', owner: { display_name: 'Ada Properties' },
  monthly_rent: 30000000, is_available: true, amenities: ['Private Bathroom', 'Prepaid Meter', 'Water', 'Parking', 'Security'],
  available_from: null, created_at: new Date().toISOString(), images: [],
};
const feed = (items = [listing], total = items.length, pages = 1) => ({ items, total, pages, page: 1, page_size: 3 });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/listings?**', route => route.fulfill({ json: feed([]) }));
});

test('home links to auth and has no fabricated listings, reviews, counts or prices', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No listings found' })).toBeVisible();
  await expect(page.locator('.room-card, .roommate-card, .landing-reviews, .landing-pricing')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('15,000');
  await expect(page.locator('body')).not.toContainText('Micheal');
  await page.getByRole('link', { name: 'Get Started', exact: true }).click();
  await expect(page).toHaveURL(/role-selection$/);
  await page.goto('/');
  await page.getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
});

test('backend listing renders into the Figma card and opens its actual details', async ({ page }) => {
  await page.route('**/api/listings?**', route => route.fulfill({ json: feed() }));
  await page.goto('/');
  await expect(page.locator('.room-card')).toHaveCount(1);
  await expect(page.locator('.room-card')).toContainText(listing.title);
  await expect(page.locator('.room-price')).toHaveText('NGN300K/month');
  await expect(page.locator('.room-owner')).toHaveText('Listed by Ada Properties');
  await expect(page.locator('.room-amenities')).toContainText('+2 more');
  await page.getByRole('button', { name: 'View Details' }).click();
  await expect(page.getByRole('dialog')).toContainText(listing.description);
  await expect(page.getByRole('dialog')).toContainText('Security');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'View Details' })).toBeFocused();
});

test('search sends real city, area and property filters to the backend', async ({ page }) => {
  await page.route('**/api/listings?**', route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: params.get('city') === 'Port Harcourt' && params.get('area') === 'Rumuola' && params.get('property_type') === 'room' ? feed() : feed([]) });
  });
  await page.goto('/');
  await page.getByLabel('City', { exact: true }).fill('Port Harcourt');
  await page.getByLabel('Area', { exact: true }).fill('Rumuola');
  await page.getByLabel('Looking for', { exact: true }).selectOption('room');
  await page.getByRole('button', { name: 'Search Now' }).click();
  await expect(page.locator('.room-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('heading', { name: 'No listings found' })).toBeVisible();
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('');
});

test('outages show a retry instead of fake cards or an empty marketplace', async ({ page }) => {
  let failed = true;
  await page.route('**/api/listings?**', route => failed ? route.fulfill({ status: 502, json: { message: 'Unable to load listings. Please try again.' } }) : route.fulfill({ json: feed() }));
  await page.goto('/');
  await expect(page.locator('.listing-feedback[role="alert"]')).toContainText('Unable to load listings');
  await expect(page.locator('.room-card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No listings found' })).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.room-card')).toHaveCount(1);
});

test('pagination and focus refresh use backend results', async ({ page }) => {
  let published = false;
  await page.route('**/api/listings?**', route => {
    const second = new URL(route.request().url()).searchParams.get('page') === '2';
    return route.fulfill({ json: published ? feed([{ ...listing, title: second ? 'Another published room' : listing.title }], 4, 2) : feed([]) });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No listings found' })).toBeVisible();
  published = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.room-card')).toContainText(listing.title);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.room-card')).toContainText('Another published room');
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('.room-card')).toContainText(listing.title);
});

for (const width of [1440, 768, 390, 320]) {
  test(`live cards preserve layout at ${width}px`, async ({ page }) => {
    await page.route('**/api/listings?**', route => route.fulfill({ json: feed() }));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('.room-card')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expect(page.locator('[data-asset-slot="listing-image"]')).toBeVisible();
    if (width === 1440) {
      const box = await page.locator('.room-card').boundingBox();
      expect(box?.width).toBe(408);
      expect(box?.height).toBeCloseTo(705, 0);
      expect((await page.locator('.room-image-slot').boundingBox())?.height).toBe(256);
      await expect(page.locator('.room-card')).toHaveCSS('border-radius', '20px');
    }
    if (width < 950) {
      await page.locator('.mobile-nav summary').click();
      await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'How it Works' }).click();
      await expect(page).toHaveURL(/#how-it-works$/);
    }
    await page.screenshot({ path: `/tmp/live-listings-${width}.png`, fullPage: true });
  });
}
