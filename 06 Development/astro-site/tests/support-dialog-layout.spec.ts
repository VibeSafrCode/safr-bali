import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 320, height: 740 }, locale: 'de-DE' });

async function blockMutations(page: Page) {
  const mutations: string[] = [];
  await page.route('**/*', async route => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      mutations.push(route.request().method());
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  return mutations;
}

for (const locale of ['de', 'fr', 'es', 'ar', 'ja']) {
  test(`HOME support leaves labels usable and dialog unclipped at320 — ${locale}`, async ({ page }) => {
    const mutations = await blockMutations(page);
    await page.goto(`/${locale}/`);
    await expect(page.locator('[data-public-home]')).toHaveAttribute('data-home-enhanced', 'true');
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page.locator('[data-support-floating]')).toBeHidden();
    const visibleLabelHits = await page.locator('[data-public-services]:not([hidden]) .service-app strong').evaluateAll(labels =>
      labels.flatMap(label => {
        const rectangle = label.getBoundingClientRect();
        const x = rectangle.left + rectangle.width / 2;
        const y = rectangle.top + rectangle.height / 2;
        if (rectangle.width <= 0 || rectangle.height <= 0 || x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) return [];
        const target = document.elementFromPoint(x, y);
        return [{ text: label.textContent, usable: Boolean(target && label.closest('a')?.contains(target)) }];
      }),
    );
    expect(visibleLabelHits.length).toBeGreaterThan(0);
    expect(visibleLabelHits.filter(label => !label.usable)).toEqual([]);
    const labelBounds = await page.locator('[data-public-services]:not([hidden]) .service-app strong').evaluateAll(labels =>
      labels.map(label => {
        const rectangle = label.getBoundingClientRect();
        const card = label.closest('a')!.getBoundingClientRect();
        return { text: label.textContent, fits: label.scrollWidth <= label.clientWidth + 1 &&
          rectangle.left >= card.left - 1 && rectangle.right <= card.right + 1 };
      }),
    );
    expect(labelBounds.length).toBeGreaterThan(0);
    expect(labelBounds.filter(label => !label.fits)).toEqual([]);
    const opener = page.locator('.public-services-panel [data-home-support-entry] [data-support-open]');
    const panel = page.locator('#support-panel');
    await opener.scrollIntoViewIfNeeded();
    await expect(opener).toBeInViewport();
    expect(await opener.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await opener.click();
    await expect(panel).toBeVisible();
    await expect(page.locator('#support-title')).toBeFocused();
    await expect(panel.locator('.support-honeypot')).toHaveAttribute('aria-hidden', 'true');
    await expect(panel.locator('input[name="website"]')).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('#support-description')).toHaveCSS('white-space', 'normal');
    const measure = () => panel.evaluate(element => {
      const description = element.querySelector<HTMLElement>('#support-description')!;
      const rectangle = element.getBoundingClientRect();
      const textRectangle = description.getBoundingClientRect();
      const closeRectangle = element.querySelector('[data-support-close]')!.getBoundingClientRect();
      return {
        panelWidth: element.clientWidth,
        panelScrollWidth: element.scrollWidth,
        descriptionWidth: description.clientWidth,
        descriptionScrollWidth: description.scrollWidth,
        left: rectangle.left,
        right: rectangle.right,
        viewportWidth: window.innerWidth,
        descriptionClearOfClose: textRectangle.right <= closeRectangle.left + 1 || textRectangle.top >= closeRectangle.bottom - 1,
      };
    });
    await expect.poll(async () => {
      const row = await measure();
      return row.panelScrollWidth <= row.panelWidth + 1 &&
        row.descriptionScrollWidth <= row.descriptionWidth + 1 &&
        row.left >= 0 && row.right <= row.viewportWidth && row.descriptionClearOfClose;
    }).toBe(true);
    for (const method of ['telegram', 'email', 'phone']) {
      await panel.locator(`.support-contact-method label:has(input[value="${method}"])`).click();
      await expect(panel.locator(`[data-contact-field="${method}"] input`)).toBeEnabled();
      await expect(panel.locator(`[data-contact-field="${method}"] input`)).toHaveAttribute('required', '');
    }
    await panel.locator('textarea[name="body"]').fill('Local support layout draft');
    await panel.locator('.support-contact-method label:has(input[value="email"])').click();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(panel.locator('textarea[name="body"]')).toHaveValue('Local support layout draft');
    await expect(panel.locator('input[name="contact_method"][value="email"]')).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
    expect(mutations).toEqual([]);
  });
}

test.describe('RU HOME menu support', () => {
  test.use({ locale: 'ru-RU' });
  test('Escape returns focus to the menu toggle after its Help opener is hidden', async ({ page }) => {
    const mutations = await blockMutations(page);
    await page.goto('/');
    const toggle = page.locator('[data-menu-toggle]');
    await toggle.click();
    const help = page.locator('#primary-navigation [data-support-open]');
    await expect(help).toBeVisible();
    await help.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(help).toBeHidden();
    await expect(page.locator('#support-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#support-panel')).toBeHidden();
    await expect(toggle).toBeFocused();
    expect(mutations).toEqual([]);
  });
});

test('desktop HOME and mobile article retain their floating support entry', async ({ page }) => {
  const mutations = await blockMutations(page);
  const panel = page.locator('#support-panel');
  const floating = page.locator('[data-support-floating]');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/en/');
  await expect(page.locator('[data-home-support-entry]')).toBeHidden();
  await expect(floating).toBeVisible();
  await floating.click();
  await expect(page.locator('#support-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(floating).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/en/bali/visas/e33g/');
  await expect(page.locator('[data-home-support-entry]')).toHaveCount(0);
  await expect(floating).toBeVisible();
  await floating.click();
  await expect(page.locator('#support-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(floating).toBeFocused();
  expect(mutations).toEqual([]);
});
