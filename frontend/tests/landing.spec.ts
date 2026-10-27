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
  await page.route('**/api/member/dashboard?**', route => route.fulfill({ status: 401, json: { message: 'Sign in required.' } }));
});

test('home has no fabricated profiles or reviews and labels planned paid plans', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No listings found' })).toBeVisible();
  await expect(page.locator('.room-card, .roommate-card, .landing-reviews figure')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in to browse' })).toBeVisible();
  await expect(page.locator('.pricing-card.premium')).toHaveCount(2);
  for (const button of await page.locator('.pricing-card.premium button').all()) await expect(button).toBeDisabled();
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

test('roommate search uses authenticated results and opens the selected profile', async ({ page }) => {
  const person = { id: 'RMF-123456', display_name: 'Test Seeker', age: null, avatar_url: null, bio: null, updated_at: null,
    preferences: { occupation: null, preferred_location: 'Yaba, Lagos', budget_min: 50000, budget_max: 150000, smoking: 'no', sleep_schedule: 'early_bird' } };
  await page.route('**/api/member/dashboard?**', route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { roommates: { items: params.get('city') === 'Lagos' && params.get('area') === 'Yaba' ? [person] : [] } } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No roommates found' })).toBeVisible();
  await page.getByLabel('City', { exact: true }).fill('Lagos');
  await page.getByLabel('Area', { exact: true }).fill('Yaba');
  await page.getByLabel('Looking for', { exact: true }).selectOption('roommate');
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/listings?')) requests.push(request.url()); });
  await page.getByRole('button', { name: 'Search Now' }).click();
  await expect(page.locator('.roommate-card')).toHaveCount(1);
  await expect(page.locator('.roommate-card')).toContainText('NGN50K–NGN150K/month');
  await expect(page.locator('.roommate-card')).toContainText('Profile activity private');
  await expect(page.locator('.live-listings')).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'View Profile' }).click();
  await expect(page.getByRole('dialog')).toContainText('Test Seeker');
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Message', exact: true })).toHaveAttribute('href', '/dashboard/messages?participant=RMF-123456');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'View Profile' })).toBeFocused();
});

test('roommate errors retry without exposing sample profiles', async ({ page }) => {
  let failed = true;
  await page.route('**/api/member/dashboard?**', route => route.fulfill(failed ? { status: 502, json: { message: 'Could not load profiles.' } } : { json: { roommates: { items: [] } } }));
  await page.goto('/');
  await expect(page.locator('.roommates-section [role="alert"]')).toContainText('Could not load profiles.');
  await expect(page.locator('.roommate-card')).toHaveCount(0);
  failed = false;
  await page.locator('.roommates-section').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'No roommates found' })).toBeVisible();
});

test('section links, FAQ keyboard controls, and free signup actions work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'About us', exact: true }).click();
  await expect(page).toHaveURL(/#about$/);
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Pricing', exact: true }).click();
  await expect(page).toHaveURL(/#pricing$/);
  const summary = page.locator('.faq-list summary').first();
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.faq-list details').first()).toHaveAttribute('open', '');
  await expect(page.locator('.faq-list details').first().locator('p')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.faq-list details').first()).not.toHaveAttribute('open', '');
  await expect(page.locator('.landing-cta').getByRole('link', { name: 'List a Space' })).toHaveAttribute('href', '/signup?role=lister');
  for (const icon of await page.locator('.landing-page .design-icon img').all()) {
    expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBeTruthy();
  }
});

test('mobile menu supports touch, dismissal, keyboard and sticky-header navigation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.route('**/api/listings?**', route => route.fulfill({ json: feed([]) }));
  await page.route('**/api/member/dashboard?**', route => route.fulfill({ status: 401, json: {} }));
  await page.goto('/');
  const toggle = page.getByLabel('Toggle navigation menu');
  const menu = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  await toggle.tap(); await expect(menu).toBeVisible();
  await toggle.tap(); await expect(menu).not.toBeVisible();
  await toggle.tap();
  await menu.getByRole('link', { name: 'Pricing', exact: true }).tap();
  await expect(page).toHaveURL(/#pricing$/); await expect(menu).not.toBeVisible();
  await toggle.tap(); await expect(menu).toBeVisible();
  await page.keyboard.press('Escape'); await expect(menu).not.toBeVisible(); await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter'); await expect(menu).toBeVisible();
  await page.mouse.click(5, 800); await expect(menu).not.toBeVisible();
  await toggle.tap();
  await page.setViewportSize({ width: 1200, height: 844 });
  await expect(page.locator('.mobile-menu')).not.toHaveAttribute('open', '');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(menu).not.toBeVisible();
  await context.close();
});

test('mobile menu opens before JavaScript is available', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Toggle navigation menu').tap();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: 'Login', exact: true }).tap();
  await expect(page).toHaveURL(/login$/);
  await context.close();
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
      await page.getByLabel('Toggle navigation menu').click();
      await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'How it Works' }).click();
      await expect(page).toHaveURL(/#how-it-works$/);
    }
    await page.screenshot({ path: `/tmp/live-listings-${width}.png`, fullPage: true });
  });
}
