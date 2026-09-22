import {expect, test} from '@playwright/test';

for (const width of [320, 390, 820, 1440]) {
  test(`country picker stays stable and opens selected services at ${width}px`, async ({browser, baseURL}) => {
    const context = await browser.newContext({baseURL, viewport: {width, height: 1000}, hasTouch: width < 1280, locale: 'ru-RU'});
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('[data-public-home]')).toHaveAttribute('data-home-enhanced', 'true');
    const cards = page.locator('[data-public-country]');
    await expect(cards).toHaveCount(5);
    const positions = await cards.evaluateAll(items => items.map(item => ({id: (item as HTMLElement).dataset.publicCountry, top: item.getBoundingClientRect().top})));
    expect(positions.map(item => item.id)).toEqual(['bali', 'thailand', 'uae', 'nepal', 'russia']);
    expect(positions.filter(item => Math.abs(item.top - positions[0].top) < 2)).toHaveLength(width < 1280 ? 3 : 5);
    await expect(page.locator('.public-country-details, .country-browse-hint, [data-country-step]')).toHaveCount(0);
    for (const id of ['thailand', 'uae', 'nepal', 'russia', 'bali']) {
      await page.locator(`[data-public-country-select="${id}"]`).click();
      await expect(page.locator('html')).toHaveAttribute('data-world', id);
      await expect(page.locator('.country-services-open:visible')).toHaveAttribute('href', `/${id}/`);
      await expect(page).toHaveURL(/\/$/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('[data-public-country-search]').fill('ОАЭ');
    await expect(page.locator('[data-public-country]:visible')).toHaveCount(1);
    await page.locator('.country-services-open:visible').click();
    await expect(page).toHaveURL(/\/uae\/$/);
    await context.close();
  });
}
