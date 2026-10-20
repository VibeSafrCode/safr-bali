import {expect, test, type Page} from '@playwright/test';

const base = '/yoga-preview/mini-app/';
const dashboard = {telegram_id: 618, first_name: 'Synthetic', username: 'fixture', balance: 12, referral_count: 3,
  referral_payload: 'r_ABCDEFGH', orders: [], locale: 'ru'};
const pendingLocaleKey = 'safr.mini.pending-locale';
const localeKey = 'safr.mini.locale';
const releases = new Set<() => void>();

function hold() {
  let complete!: () => void;
  const promise = new Promise<void>(resolve => { complete = resolve; });
  const release = () => { releases.delete(release); complete(); };
  releases.add(release);
  return {promise, release};
}

test.afterEach(() => { for (const release of [...releases]) release(); });

type SetupOptions = {sdk?: 'ready' | 'error' | 'outside'; sdkGate?: Promise<void>; cachedLocale?: 'ru' | 'en'; pendingLocale?: 'ru' | 'en'};
async function setup(page: Page, options: SetupOptions = {}) {
  const calls: string[] = [];
  const writes: Array<{path: string; body: unknown}> = [];
  await page.addInitScript(({cached, pending}) => {
    localStorage.setItem('safr.mini.locale', cached);
    if (pending) localStorage.setItem('safr.mini.pending-locale', pending);
    else localStorage.removeItem('safr.mini.pending-locale');
  }, {cached: options.cachedLocale ?? 'ru', pending: options.pendingLocale});
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith(base + 'api/')) return;
    calls.push(path);
    if (request.method() !== 'GET') writes.push({path, body: request.postDataJSON()});
  });
  // Telegram and every other external origin are intercepted; no live APIs.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4323(?:\/|$))/, route => route.abort());
  await page.route(/telegram-web-app\.js/, async route => {
    if (options.sdkGate) await options.sdkGate;
    if (options.sdk === 'error') return route.abort();
    return route.fulfill({contentType: 'application/javascript', body: `window.Telegram={WebApp:{initData:${JSON.stringify(options.sdk === 'outside' ? '' : 'signed-synthetic-yoga')},ready(){},expand(){},version:'8.0',platform:'web',colorScheme:'dark',onEvent(){},offEvent(){}}};`});
  });
  await page.route('**/yoga-preview/mini-app/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/yoga-session')) await route.fulfill({json: {status: 'ok'}});
    else if (path.endsWith('/yoga-account')) await route.fulfill({json: dashboard});
    else if (path.endsWith('/life-services') || path.endsWith('/visa-cases')) await route.fulfill({json: {items: []}});
    else if (path.endsWith('/chat')) await route.fulfill({json: {id: null, status: 'empty', messages: []}});
    else if (path.endsWith('/locale')) await route.fulfill({json: {ok: true}});
    else if (path.endsWith('/catalog/pricing')) await route.fulfill({status: 503, json: {detail: 'fixture unavailable'}});
    else await route.fulfill({status: 404, json: {detail: 'unexpected fixture path'}});
  });
  return {calls, writes, count: (suffix: string) => calls.filter(path => path.endsWith(suffix)).length};
}

function bottom(page: Page, name: string) { return page.locator('.bottom-nav').getByRole('button', {name, exact: true}); }
async function lifeReady(page: Page) {
  await expect(page.locator('.bali-life')).toBeVisible();
  await expect(page.locator('.bali-life')).toContainText('Здесь пока нет опубликованных услуг.');
}
async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function chooseLocale(page: Page, next: 'ru' | 'en') {
  await page.locator('.yoga-language-trigger').click();
  await page.locator('#yoga-language-options').getByRole('button', {name: next === 'ru' ? 'RU Русский' : 'EN English', exact: true}).click();
}
function pricing(expiry = '2099-01-01T00:00:00Z', dollars = '680') {
  return {projection_id: 'synthetic-price', publication_version: 1, catalog_version_id: 1, catalog_version: 1,
    fx_snapshot_id: 7, formula_version: 'canonical-fixture', accepted_at: '2026-10-15T00:00:00Z', derived_expires_at: expiry,
    max_refresh_lag_seconds: 60, currency: 'IDR', fx: {version: 7, status: 'fresh', ask_idr_per_usdt: '17635', is_manual_override: false},
    items: [{sku: 'visa:E33G:standard', entity_type: 'VISA', entity_key: 'E33G', option_code: 'standard', label: {ru: 'Стандарт', en: 'Standard'}, price_qualifier: 'EXACT', amount_idr: '12000000', show_price: true, fee_verification_status: 'VERIFIED', fee_note: {ru: null, en: null}, display_usdt: '680.46', display_usd_approx: dollars, sort_order: 0}]};
}
async function openVisaCatalog(page: Page) {
  await bottom(page, 'Услуги').click();
  await page.locator('.service-grid .service-card').filter({has: page.getByText('Визы', {exact: true})}).click();
  await page.getByRole('button', {name: 'Все варианты', exact: true}).click();
  await expect(page.locator('.visa-grid')).toBeVisible();
}

test('rejected optional chunk keeps real bottom navigation usable without another auth exchange', async ({page}) => {
  const fixture = await setup(page);
  await page.route('**/assets/CatalogView-*.js', route => route.fulfill({status: 404, body: 'Not found'}));
  await page.goto(base + '#/life');
  await lifeReady(page);
  await bottom(page, 'Услуги').click();
  await expect(page.getByRole('heading', {name: 'Не удалось загрузить раздел'})).toBeVisible();
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Перезагрузить Mini App'})).toBeVisible();
  await bottom(page, 'Моя жизнь').click();
  await expect(page.getByRole('heading', {name: 'Не удалось загрузить раздел'})).toHaveCount(0);
  await lifeReady(page);
  expect(fixture.count('/auth/yoga-session')).toBe(1);
});

test('SDK error occurring after React replaced the static shell shows recovery, never outside advice or pricing', async ({page}) => {
  const sdk = hold();
  const fixture = await setup(page, {sdk: 'error', sdkGate: sdk.promise});
  await page.goto(base, {waitUntil: 'domcontentloaded'});
  await expect(page.locator('#yoga-bootstrap-status')).toHaveCount(0);
  await expect(page.locator('.status-screen .brand-mark')).toHaveText('YG');
  expect(await page.evaluate(() => (window as Window & {__yogaTelegramSdk?: {status: string}}).__yogaTelegramSdk?.status)).toBe('loading');
  sdk.release();
  await expect(page.locator('.status-screen')).toContainText('Не удалось загрузить Telegram');
  expect(await page.evaluate(() => (window as Window & {__yogaTelegramSdk?: {status: string}}).__yogaTelegramSdk?.status)).toBe('error');
  await expect(page.getByRole('button', {name: /Попробовать|Повторить|Retry/})).toBeVisible();
  await expect(page.locator('.status-screen a')).toHaveCount(0);
  expect(fixture.calls).toHaveLength(0);
});

test('real outside launch is distinct; initial Yoga has no hidden country background or pricing requests', async ({page}) => {
  const fixture = await setup(page, {sdk: 'outside'});
  const countries: string[] = [];
  page.on('request', request => { if (/assets\/heroes\//.test(request.url())) countries.push(request.url()); });
  await page.goto(base);
  await expect(page.locator('.status-screen a')).toHaveAttribute('href', 'https://t.me/Yoga_ganster_bot');
  expect(fixture.calls).toHaveLength(0);
  expect(countries).toHaveLength(0);
});

test('an unsent support draft survives ordinary navigation without sending a message', async ({page}) => {
  const fixture = await setup(page);
  await page.goto(base + '#/life');
  await lifeReady(page);
  await expect(page.locator('.user-chip')).toHaveAttribute('aria-label', /Synthetic/);
  await page.getByRole('button', {name: 'Написать в поддержку', exact: true}).click();
  const drawer = page.getByRole('dialog', {name: 'Написать менеджеру', exact: true});
  await drawer.getByLabel('Как к вам обращаться').fill('Synthetic unsent name');
  await drawer.locator('.contact-input input').fill('@unsent_fixture');
  await drawer.getByLabel('Ваше сообщение', {exact: true}).fill('Synthetic draft: do not deliver');
  await drawer.getByRole('button', {name: 'Закрыть', exact: true}).click();
  await bottom(page, 'Услуги').click();
  await expect(page.locator('.service-grid')).toBeVisible();
  await page.getByRole('button', {name: 'Написать в поддержку', exact: true}).click();
  await expect(drawer.getByLabel('Как к вам обращаться')).toHaveValue('Synthetic unsent name');
  await expect(drawer.locator('.contact-input input')).toHaveValue('@unsent_fixture');
  await expect(drawer.getByLabel('Ваше сообщение', {exact: true})).toHaveValue('Synthetic draft: do not deliver');
  expect(fixture.count('/chat/messages')).toBe(0);
  expect(fixture.count('/auth/yoga-session')).toBe(1);
});

test('verified Life starts while account is slow; account completion keeps the same mounted Life and one read pair', async ({page}) => {
  const auth = hold(), account = hold();
  const fixture = await setup(page);
  await page.route('**/api/mini-app/auth/yoga-session', async route => { await auth.promise; await route.fulfill({json: {authenticated: true}}); });
  await page.route('**/api/mini-app/yoga-account', async route => { await account.promise; await route.fulfill({json: dashboard}); });
  await page.goto(base + '#/life', {waitUntil: 'domcontentloaded'});
  await expect.poll(() => fixture.count('/auth/yoga-session')).toBe(1);
  expect(fixture.calls).toHaveLength(1);
  await expect(page.locator('.app-shell')).toHaveCount(0);
  auth.release();
  await lifeReady(page);
  expect(fixture.count('/yoga-account')).toBe(1);
  expect(fixture.count('/life-services')).toBe(1);
  expect(fixture.count('/visa-cases')).toBe(1);
  expect(fixture.count('/catalog/pricing')).toBe(0);
  await expect(page.locator('.user-chip')).toHaveAttribute('aria-label', /—/);
  const life = await page.locator('.bali-life').elementHandle();
  account.release();
  await expect(page.locator('.user-chip')).toHaveAttribute('aria-label', /Synthetic/);
  await settle(page);
  expect(await life!.evaluate(node => node.isConnected)).toBe(true);
  expect(fixture.count('/life-services')).toBe(1);
  expect(fixture.count('/visa-cases')).toBe(1);
  expect(fixture.count('/auth/yoga-session')).toBe(1);
});

for (const status of [401, 403]) {
  test(`startup account ${status} clears personal UI and stops startup reads without another auth`, async ({page}) => {
    const account = hold();
    const fixture = await setup(page);
    await page.route('**/api/mini-app/yoga-account', async route => { await account.promise; await route.fulfill({status, json: {detail: 'synthetic session denied'}}); });
    await page.goto(base + '#/life');
    await lifeReady(page);
    account.release();
    await expect(page.locator('.status-screen')).toContainText('Сессия истекла');
    await expect(page.locator('.app-shell')).toHaveCount(0);
    await expect(page.locator('.bali-life, .profile-stats, .client-profile-identity')).toHaveCount(0);
    const stopped = fixture.calls.length;
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await settle(page);
    expect(fixture.calls).toHaveLength(stopped);
    expect(fixture.count('/auth/yoga-session')).toBe(1);
    expect(fixture.count('/catalog/pricing')).toBe(0);
  });
}

test('pending language PATCH does not block Life and failure restores the confirmed locale without auth retry', async ({page}) => {
  const patch = hold();
  const fixture = await setup(page);
  await page.route('**/api/mini-app/locale', async route => { await patch.promise; await route.fulfill({status: 503, json: {detail: 'synthetic language failure'}}); });
  await page.goto(base + '#/life');
  await expect(page.locator('.bali-life')).toBeVisible();
  await expect(page.locator('.user-chip')).toHaveAttribute('aria-label',/Synthetic/);
  await chooseLocale(page,'en');
  await expect.poll(()=>fixture.count('/locale')).toBe(1);
  await expect(page.locator('.yoga-language-trigger')).toHaveText('EN');
  expect(fixture.count('/locale')).toBe(1);
  patch.release();
  await expect(page.locator('.yoga-language-trigger')).toHaveText('RU');
  await expect(page.locator('.locale-sync-status.error')).toContainText('Вернули предыдущий язык');
  expect(await page.evaluate(key => localStorage.getItem(key), localeKey)).toBe('ru');
  expect(await page.evaluate(key => localStorage.getItem(key), pendingLocaleKey)).toBeNull();
  expect(fixture.count('/auth/yoga-session')).toBe(1);
});

test('legacy unbound pending language never authorizes a write for the verified Yoga actor',async({page})=>{
  const fixture=await setup(page,{pendingLocale:'en'});
  await page.goto(base+'#/life');
  await lifeReady(page);
  await expect(page.locator('.user-chip')).toHaveAttribute('aria-label',/Synthetic/);
  await settle(page);
  await expect(page.locator('.yoga-language-trigger')).toHaveText('RU');
  expect(fixture.count('/locale')).toBe(0);
  expect(fixture.count('/auth/yoga-session')).toBe(1);
  expect(fixture.writes.filter(row=>row.path.endsWith('/locale'))).toEqual([]);
});

for (const outcome of ['success', 'error'] as const) {
  test(`a late EN PATCH ${outcome} cannot erase a newer offline RU intent`, async ({page}) => {
    const patch = hold();
    const fixture = await setup(page);
    await page.route('**/api/mini-app/locale', async route => { await patch.promise; await route.fulfill({status: outcome === 'success' ? 200 : 503, json: outcome === 'success' ? {ok: true} : {detail: 'synthetic failure'}}); });
    await page.goto(base + '#/life');
    await lifeReady(page);
    await expect(page.locator('.user-chip')).toHaveAttribute('aria-label', /Synthetic/);
    await chooseLocale(page, 'en');
    await expect.poll(() => fixture.count('/locale')).toBe(1);
    await expect(page.locator('.yoga-language-trigger')).toHaveText('EN');
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', {configurable: true, get: () => false}));
    await chooseLocale(page, 'ru');
    await expect(page.locator('.yoga-language-trigger')).toHaveText('RU');
    expect(await page.evaluate(key => localStorage.getItem(key), pendingLocaleKey)).toBe('ru');
    const completedPatch = page.waitForResponse(response => response.url().endsWith('/api/mini-app/locale'));
    patch.release();
    await (await completedPatch).finished();
    await settle(page);
    await expect(page.locator('.yoga-language-trigger')).toHaveText('RU');
    await expect(page.locator('.locale-sync-status.offline')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), pendingLocaleKey)).toBe('ru');
    expect(await page.evaluate(key => localStorage.getItem(key), localeKey)).toBe('ru');
    expect(fixture.count('/locale')).toBe(1);
    expect(fixture.count('/auth/yoga-session')).toBe(1);
  });
}

test('a pre-account RU choice atomically replaces stored EN before account resolves', async ({page}) => {
  const account = hold(), patch = hold();
  const fixture = await setup(page, {cachedLocale: 'en', pendingLocale: 'en'});
  await page.route('**/api/mini-app/yoga-account', async route => { await account.promise; await route.fulfill({json: {...dashboard, locale: 'en'}}); });
  await page.route('**/api/mini-app/locale', async route => { await patch.promise; await route.fulfill({json: {ok: true}}); });
  await page.goto(base + '#/life');
  await expect(page.locator('.bali-life')).toBeVisible();
  await expect(page.locator('.yoga-language-trigger')).toHaveText('EN');
  await chooseLocale(page, 'ru');
  // No 250 ms wait: accepted intent and pending storage must be atomic before
  // account returns the older locale, not only eventually consistent afterward.
  expect(await page.evaluate(key => localStorage.getItem(key), pendingLocaleKey)).toBe('ru');
  account.release();
  await expect(page.locator('.user-chip')).toHaveAttribute('aria-label', /Synthetic/);
  await expect.poll(() => fixture.count('/locale')).toBe(1);
  expect(fixture.writes.filter(write => write.path.endsWith('/locale')).map(write => write.body)).toEqual([{locale: 'ru'}]);
  await expect(page.locator('.yoga-language-trigger')).toHaveText('RU');
  expect(await page.evaluate(key => localStorage.getItem(key), pendingLocaleKey)).toBe('ru');
  patch.release();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), pendingLocaleKey)).toBeNull();
  expect(fixture.count('/auth/yoga-session')).toBe(1);
});

test('pricing demand goes zero to two to one to zero, sharing in-flight reads and stopping idle refresh', async ({page}) => {
  await page.clock.install({time: new Date('2026-10-15T12:00:00Z')});
  const projection = hold();
  const fixture = await setup(page);
  await page.route('**/api/catalog/pricing', async route => { await projection.promise; await route.fulfill({json: pricing()}); });
  await page.goto(base + '#/life');
  await lifeReady(page);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await settle(page);
  expect(fixture.count('/catalog/pricing')).toBe(0);
  await openVisaCatalog(page); // CatalogView + mounted VisaGrid: two consumers.
  await expect.poll(() => fixture.count('/catalog/pricing')).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await settle(page);
  expect(fixture.count('/catalog/pricing')).toBe(1);
  await page.getByRole('button', {name: 'Подобрать визу', exact: true}).click();
  await expect(page.locator('.visa-grid')).toHaveCount(0); // CatalogView remains.
  const firstResponse = page.waitForResponse(response => response.url().endsWith('/api/catalog/pricing'));
  projection.release();
  await (await firstResponse).finished();
  await settle(page);
  const nextResponse = page.waitForResponse(response => response.url().endsWith('/api/catalog/pricing'));
  await page.clock.fastForward(60_001);
  await (await nextResponse).finished();
  await expect.poll(() => fixture.count('/catalog/pricing')).toBe(2);
  await bottom(page, 'Моя жизнь').click();
  await lifeReady(page);
  const stopped = fixture.count('/catalog/pricing');
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.fastForward(60_001);
  await settle(page);
  expect(fixture.count('/catalog/pricing')).toBe(stopped);
  expect(fixture.count('/auth/yoga-session')).toBe(1);
});

test('an expired cached projection never flashes its derived price when the next consumer mounts', async ({page}) => {
  await page.clock.install({time: new Date('2026-10-15T12:00:00Z')});
  const refreshed = hold();
  const fixture = await setup(page);
  let reads = 0;
  await page.route('**/api/catalog/pricing', async route => {
    if (++reads === 1) return route.fulfill({json: pricing('2026-10-15T12:05:00Z')});
    await refreshed.promise;
    return route.fulfill({json: pricing('2099-01-01T00:00:00Z', '685')});
  });
  await page.goto(base + '#/life');
  await lifeReady(page);
  await openVisaCatalog(page);
  await expect(page.locator('.visa-grid')).toContainText('≈ $680');
  await bottom(page, 'Профиль').click();
  await expect(page.locator('.profile-stats')).toBeVisible();
  // Change wall time without firing expiry timers. Observe actual DOM mutations
  // from before navigation, including the first consumer frame; no source hooks.
  await page.clock.setSystemTime(new Date('2026-10-15T12:06:00Z'));
  await page.evaluate(() => {
    const capture = {seen: false, observer: null as MutationObserver | null};
    capture.observer = new MutationObserver(() => {
      if (document.querySelector('.visa-grid')?.textContent?.includes('≈ $680')) capture.seen = true;
    });
    capture.observer.observe(document.body, {subtree: true, childList: true, characterData: true});
    (window as Window & {__yogaExpiryFixture?: typeof capture}).__yogaExpiryFixture = capture;
  });
  await openVisaCatalog(page);
  await settle(page);
  await expect(page.locator('.visa-grid')).not.toContainText('≈ $680');
  expect(await page.evaluate(() => {
    const capture = (window as Window & {__yogaExpiryFixture?: {seen: boolean; observer: MutationObserver | null}}).__yogaExpiryFixture!;
    capture.observer?.disconnect();
    return capture.seen;
  })).toBe(false);
  refreshed.release();
  await expect(page.locator('.visa-grid')).toContainText('≈ $685');
  expect(fixture.count('/auth/yoga-session')).toBe(1);
});
