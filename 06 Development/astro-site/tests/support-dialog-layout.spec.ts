import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 320, height: 740 }, locale: 'de-DE' });

for (const locale of ['de', 'fr', 'ar', 'ja']) {
  test(`support description wraps without clipping at320 — ${locale}`, async ({ page }) => {
    const mutations: string[] = [];
    await page.route('**/*', async route => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
        mutations.push(route.request().method());
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await page.goto(`/${locale}/`);
    const opener = page.locator('[data-support-floating]');
    const panel = page.locator('#support-panel');
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
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
    expect(mutations).toEqual([]);
  });
}
