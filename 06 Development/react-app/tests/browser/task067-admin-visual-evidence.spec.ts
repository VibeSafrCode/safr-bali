import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test.setTimeout(240_000);

const artifactRoot = path.resolve("../artifacts/BALI-TASK-067/designer-review/admin");
const sizes = [
  { name: "compact-320", width: 320, height: 844 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 900 },
];
const combinations = [
  { locale: "ru" as const, theme: "dark" as const },
  { locale: "ru" as const, theme: "light" as const },
  { locale: "en" as const, theme: "dark" as const },
  { locale: "en" as const, theme: "light" as const },
];

const clients = [
  { id: 18, username: "polina", first_name: "Полина", last_name: "Хетай", telegram_id_mask: "••••1250", bot_status: "active", status: "active", created_at: "2026-08-20T10:00:00Z", last_activity_at: "2026-08-25T09:30:00Z", tags: ["Bali"], active_visa_count: 1, requires_attention: true },
  { id: 22, username: "alex", first_name: "Alex", last_name: "Morgan", telegram_id_mask: "••••2210", bot_status: "active", status: "active", created_at: "2026-08-18T10:00:00Z", last_activity_at: "2026-08-24T08:15:00Z", tags: ["Visa"], active_visa_count: 1, requires_attention: false },
];
const cases = [
  { id: 51, user_id: 18, country_code: "ID", custom_visa_name: "eVOA / B1", visa_type: { code: "B1", name: "eVOA / B1" }, service_status: "PROCESSING", lifecycle_status: "ACTIVE", publication_status: "PUBLISHED", notifications_enabled: true, stay_end: "2026-09-20", date_source: "IMMIGRATION", next_action_text: "Biometrics appointment", recommended_contact_at: "2026-08-28", contact_reason_code: "VISA_EXPIRY", version: 4, assigned_admin: { id: 2, name: "Visa Admin", role: "visa_manager" }, assignments: [{ id: 61, staff_user_id: 2, name: "Visa Admin", primary: true }], documents: [{ id: 71, type: "VISA", name: "Visa confirmation", visibility: "CLIENT", archived: false, download_url: "/api/web/admin/visa-cases/51/documents/71/download" }], processes: [{ id: 91, type: "APPLICATION", external_status: "ACTION_REQUIRED", reference_mask: "••••42" }] },
  { id: 52, user_id: 18, country_code: "ID", custom_visa_name: "Previous B1", visa_type: { code: "B1", name: "eVOA / B1" }, service_status: "COMPLETED", lifecycle_status: "EXPIRED", publication_status: "ARCHIVED", notifications_enabled: false, version: 2, assigned_admin: { id: 1, name: "Root Admin", role: "admin" }, documents: [], processes: [] },
];
const detail = {
  client: clients[0], visa_cases: cases,
  notes: [{ id: 1, body: "Contact preference confirmed.", pinned: false }], credentials: [],
  dialogue: { id: 41, status: "open", messages: [
    { id: 1, author_type: "client", body: "Hello\nPlease confirm the next step.", visibility: "client", created_at: "2026-08-25T08:00:00Z" },
    { id: 2, author_type: "staff", body: "We received your message.", visibility: "client", created_at: "2026-08-25T08:10:00Z", delivery_status: "pending" },
    { id: 3, author_type: "staff", body: "Your appointment is confirmed.", visibility: "client", created_at: "2026-08-25T08:20:00Z", delivery_status: "delivered" },
    { id: 4, author_type: "staff", body: "Please retry this delivery.", visibility: "client", created_at: "2026-08-25T08:30:00Z", delivery_status: "failed" },
  ] },
};

type FixtureOptions = {
  storageReady?: boolean;
  uploadMode?: "accepted" | "rejected" | "error" | "pending";
  deleteMode?: "success" | "error" | "pending";
  correctionMode?: "success" | "error" | "pending";
};

function respond(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify(body) });
}

async function installFixture(page: Page, locale: "ru" | "en", theme: "dark" | "light", options: FixtureOptions = {}) {
  let deleted = false;
  await page.addInitScript((selectedTheme) => localStorage.setItem("safrway:appearance", selectedTheme), theme);
  await page.route("**/api/web/**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const pathname = url.pathname;
    if (pathname === "/api/web/admin/session") return respond(route, 200, { authenticated: true, actor: { id: 1, first_name: locale === "ru" ? "Главный админ" : "Root admin", role: "admin", locale }, csrf_token: "fixture-csrf" });
    if (pathname === "/api/web/locale") return respond(route, 200, { locale });
    if (pathname === "/api/web/admin/clients") return respond(route, 200, { total: clients.length, items: clients });
    if (pathname === "/api/web/admin/clients/18") return respond(route, 200, { ...detail, visa_cases: deleted ? cases.filter((item) => item.id !== 52) : cases });
    if (pathname === "/api/web/admin/visa-cases/archive") {
      const archived = deleted ? [] : [{ ...cases[1], archived_at: "2026-08-24T10:00:00Z", client: { id: 18, name: "Полина Хетай", username: "polina", telegram_id_mask: "••••1250" } }];
      return respond(route, 200, { total: archived.length, page: 1, items: archived });
    }
    if (pathname === "/api/web/admin/visa-cases/types") return respond(route, 200, { items: [{ id: 1, code: "B1", name: "eVOA / B1", version: 3, rules_verified: true }, { id: 2, code: "OTHER", name: "Other Visa", version: 1, rules_verified: false }] });
    if (pathname === "/api/web/admin/visa-cases/document-storage/readiness") { const ready = options.storageReady ?? true; return respond(route, 200, { storage_configured: ready, storage_private: ready, encryption_configured: ready, key_versioned: ready, key_custody_confirmed: ready, scanner_configured: ready, retention_configured: ready, backup_restore_verified: ready, ready, max_bytes: 10485760 }); }
    if (pathname === "/api/web/admin/visa-cases/staff/visa-managers") return respond(route, 200, { enabled: true, items: [{ user_id: 1, name: "Root Admin", role_code: "admin" }, { user_id: 2, name: "Visa Admin", role_code: "visa_manager" }] });
    if (pathname === "/api/web/admin/visa-cases/staff") return respond(route, 200, { items: [{ user_id: 2, name: "Visa Admin", role_code: "visa_manager", active: true }] });
    if (pathname === "/api/web/admin/visa-cases/51") return respond(route, 200, cases[0]);
    if (pathname === "/api/web/admin/visa-cases/52/delete-preview") return respond(route, 200, { visa_case_id: 52, visa_type_code: "B1", dependency_counts: { visa_processes: 1, visa_events: 4, visa_notification_deliveries: 0, visa_documents: 0 }, unexpected_dependencies: [], protected_files_present: false, executable: true });
    if (pathname === "/api/web/admin/visa-cases/52/permanent-delete" && request.method() === "POST") {
      if (options.deleteMode === "pending") { await new Promise((resolve) => setTimeout(resolve, 10_000)); deleted = true; return respond(route, 200, { deleted: true }); }
      if (options.deleteMode === "error") return respond(route, 409, { detail: locale === "ru" ? "Версия изменилась; данные не удалены" : "Version changed; nothing was deleted" });
      deleted = true; return respond(route, 200, { deleted: true, visa_case_id: 52, tombstone_id: 8, idempotent_replay: false });
    }
    if (pathname === "/api/web/admin/visa-cases/51/documents/upload" && request.method() === "POST") {
      if (options.uploadMode === "pending") { await new Promise((resolve) => setTimeout(resolve, 10_000)); return respond(route, 201, { id: 72 }); }
      if (options.uploadMode === "rejected") return respond(route, 422, { detail: "scanner rejected fixture" });
      if (options.uploadMode === "error") return respond(route, 503, { detail: "storage unavailable fixture" });
      return respond(route, 201, { id: 72, visibility: "CLIENT", checksum_sha256: "a".repeat(64) });
    }
    if (pathname === "/api/web/admin/referrals") return respond(route, 200, { total: 2, items: [], metrics: { clients: 3, links: 2 } });
    if (pathname === "/api/web/admin/referrals/graph") return respond(route, 200, { total_edges: 2, truncated: false, nodes: [{ id: 1, label: "Root Admin" }, { id: 18, label: "Полина Хетай" }, { id: 22, label: "Alex Morgan" }], edges: [{ id: 1, parent_id: 1, child_id: 18, source: "explicit_referral" }, { id: 2, parent_id: 18, child_id: 22, source: "explicit_referral" }] });
    if (pathname === "/api/web/admin/referrals/correction-preview") return respond(route, 200, { child_user_id: 22, previous_parent_user_id: 18, new_parent_user_id: 1, referral_row_id: 2, reward_ledger_rows: 0, conflicts: [], executable: true });
    if (pathname === "/api/web/admin/referrals/corrections" && request.method() === "POST") {
      if (options.correctionMode === "pending") { await new Promise((resolve) => setTimeout(resolve, 10_000)); return respond(route, 201, { id: 7 }); }
      if (options.correctionMode === "error") return respond(route, 409, { detail: locale === "ru" ? "Связь изменилась; запись не выполнена" : "Relationship changed; nothing was written" });
      return respond(route, 201, { id: 7, idempotent_replay: false });
    }
    if (pathname === "/api/web/admin/settings") return respond(route, 200, {
      visa_types: [{ id: 1, code: "B1", name: "eVOA / B1", version: 3, settings_version: 2, active: true, rules_verified: true }],
      services: [{ slug: "visa-support", name: locale === "ru" ? "Визовое сопровождение" : "Visa support", description: "", category: "visa", settings_version: 3, is_active: true, can_pay_with_points: false }],
      exchange_routes: [{ route_code: "USDT_TO_RUB_BANK", version: 4, settings: { safrway_fee_percent: "4", safrway_min_fee: "1000", safrway_min_fee_currency: "RUB", quote_ttl_seconds: 300 } }],
      notifications: [{ event: "CASE_UPDATED", delivery: "Telegram", audience: "client", configuration_scope: "per_case", enabled: true }],
      document_storage: { storage_configured: true, encryption_configured: true, scanner_configured: true, ready: true, max_bytes: 10485760 },
    });
    if (/\/api\/web\/admin\/settings\/business\/.+\/versions$/.test(pathname)) return respond(route, 200, { versions: [{ version: 2, is_active: true, payload: {}, effective_from: "2026-08-25", reason: "Verified fixture" }, { version: 1, is_active: false, payload: {}, effective_from: "2026-08-01", reason: "Initial fixture" }] });
    if (/\/api\/web\/admin\/settings\/exchange\/.+\/versions$/.test(pathname)) return respond(route, 200, { versions: [{ id: 2, route_code: "USDT_TO_RUB_BANK", version: 4, is_active: true, settings: {}, effective_from: "2026-08-25" }, { id: 1, route_code: "USDT_TO_RUB_BANK", version: 3, is_active: false, settings: {}, effective_from: "2026-08-01" }] });
    if (pathname === "/api/web/admin/dashboard") return respond(route, 200, { new_users_7d: 2, active_visa_cases: 1, open_conversations: 1, orders_attention: 0, referral_missing_rows: 0, visa_cases_attention: 1 });
    if (request.method() === "GET") return respond(route, 200, { total: 0, items: [] });
    return respond(route, 409, { detail: "Visual fixture blocks writes" });
  });
}

async function assertViewport(page: Page, theme: "dark" | "light") {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  for (const button of await page.locator(".appearance-controls button").all()) {
    const box = await button.boundingBox(); expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}

async function assertDialogueContrast(page: Page) {
  const ratios = await page.locator(".chat-message").evaluateAll((messages) => {
    const rgb = (input: string) => (input.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (values: number[]) => values.map((value) => { const channel = value / 255; return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    return messages.flatMap((message) => [...message.querySelectorAll("span,time,p")].map((node) => {
      const foreground = luminance(rgb(getComputedStyle(node).color));
      const background = luminance(rgb(getComputedStyle(message).backgroundColor));
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    }));
  });
  expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
}

test("BALI-TASK-067 Admin RU/EN light/dark responsive matrix", async ({ browser }) => {
  await mkdir(artifactRoot, { recursive: true });
  for (const size of sizes) for (const combination of combinations) {
    await mkdir(path.join(artifactRoot, size.name), { recursive: true });
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await installFixture(page, combination.locale, combination.theme);
    const suffix = `${combination.locale}-${combination.theme}`;

    await page.goto("/admin/clients/");
    await expect(page.getByRole("heading", { name: combination.locale === "ru" ? "Клиенты" : "Clients" }).last()).toBeVisible();
    await expect(page.locator(".admin-heading p")).toHaveText(combination.locale === "ru" ? "Клиенты, визы и защищённые рабочие действия." : "Clients, visas, and protected work actions.");
    await assertViewport(page, combination.theme);
    const cards = page.locator(".crm-client-card-button");
    const first = await cards.nth(0).boundingBox(); const second = await cards.nth(1).boundingBox();
    if (size.width >= 1440) expect(Math.abs((first?.y ?? 0) - (second?.y ?? 1))).toBeLessThan(3);
    else expect((second?.y ?? 0)).toBeGreaterThan((first?.y ?? 0) + 40);
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${suffix}-01-clients.png`), fullPage: true });

    await cards.first().click();
    await expect(page.getByText("eVOA / B1", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: combination.locale === "ru" ? /Удалить навсегда/ : /Delete permanently/ })).toHaveCount(0);
    await expect(page.locator('[role="log"] .chat-message')).toHaveCount(4);
    if (combination.theme === "dark") await assertDialogueContrast(page);
    await assertViewport(page, combination.theme);
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${suffix}-02-client-detail.png`), fullPage: true });
    const retry = page.getByRole("button", { name: combination.locale === "ru" ? "Повторить отправку" : "Retry delivery" });
    await retry.scrollIntoViewIfNeeded(); await retry.focus();
    const retryBox = await retry.boundingBox(); expect(retryBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${suffix}-02b-dialogue-delivery-states.png`), fullPage: true });

    await page.locator(".crm-case-row > button").first().click();
    await expect(page.getByRole("heading", { name: combination.locale === "ru" ? "Редактировать визу" : "Edit visa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: combination.locale === "ru" ? "Защищённые документы" : "Protected documents" })).toBeVisible();
    await expect(page.locator("form form")).toHaveCount(0);
    const editorText = await page.locator(".crm-visa-editor").innerText();
    if (combination.locale === "en") {
      expect(editorText).not.toMatch(/Редактировать визу|Статус услуги|Статус визы|Использовать до|Находиться до|Следующее действие|Рекомендуемая дата связи|Показывать клиенту|Уведомить клиента|Сохранить/);
      expect(editorText).toContain("Service status");
      expect(editorText).toContain("Visa status");
      expect(editorText).toContain("Save");
    } else {
      expect(editorText).toContain("Статус услуги");
      expect(editorText).toContain("Статус визы");
      expect(editorText).toContain("Сохранить");
    }
    await page.locator(".crm-assignment summary").click();
    await expect(page.locator(".crm-assignment-list")).toContainText("Visa Admin");
    await assertViewport(page, combination.theme);
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${suffix}-03-visa-editor.png`), fullPage: true });

    await page.goto("/admin/referrals/");
    await expect(page.getByRole("heading", { name: combination.locale === "ru" ? "Реферальная сеть" : "Referral network" })).toBeVisible();
    await expect(page.locator(".admin-heading p")).toHaveText(combination.locale === "ru" ? "Подтверждённые связи и безопасные исправления." : "Verified relationships and safe corrections.");
    if (combination.locale === "ru") { await expect(page.getByText("Клиенты в сети", { exact: true })).toBeVisible(); await expect(page.getByText("Подтверждённые связи", { exact: true })).toBeVisible(); await expect(page.locator(".admin-metrics")).not.toContainText(/\bclients\b|\blinks\b/); }
    await page.getByText(combination.locale === "ru" ? "Доступный список связей" : "Accessible relationship list").click();
    await expect(page.locator(".admin-graph-fallback li")).toHaveCount(2);
    await page.getByText(combination.locale === "ru" ? "Исправить подтверждённую атрибуцию" : "Correct verified attribution").click();
    await page.getByLabel(combination.locale === "ru" ? "SAFRWAY ID клиента" : "Client SAFRWAY ID").fill("22");
    await page.getByLabel(combination.locale === "ru" ? "SAFRWAY ID нового пригласившего" : "New inviter SAFRWAY ID").fill("1");
    await page.getByRole("button", { name: combination.locale === "ru" ? "Проверить без записи" : "Preview without writing" }).click();
    await page.getByLabel(combination.locale === "ru" ? "Основание и причина" : "Evidence and reason").fill(combination.locale === "ru" ? "Проверенное основание" : "Verified evidence");
    await page.getByRole("checkbox", { name: combination.locale === "ru" ? /Подтверждаю проверенное основание/ : /I confirm the verified evidence/ }).check();
    await assertViewport(page, combination.theme);
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${suffix}-04-referrals.png`), fullPage: true });

    await page.goto("/admin/settings/");
    await expect(page.getByText("eVOA / B1").first()).toBeVisible();
    await assertViewport(page, combination.theme);
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${suffix}-05-settings.png`), fullPage: true });

    const visaCard = page.locator(".admin-settings .admin-entity-card").first();
    await visaCard.getByRole("button", { name: combination.locale === "ru" ? "Изменить" : "Edit", exact: true }).click();
    await page.getByLabel(combination.locale === "ru" ? "Название" : "Name").fill(combination.locale === "ru" ? "eVOA / B1 — проверено" : "eVOA / B1 — verified");
    await page.getByLabel(combination.locale === "ru" ? "Причина изменения" : "Change reason").fill(combination.locale === "ru" ? "Проверка редактора" : "Editor review");
    await page.getByRole("button", { name: combination.locale === "ru" ? "Предпросмотр" : "Preview", exact: true }).click();
    await page.getByText(combination.locale === "ru" ? "История и восстановление" : "History and restore").click();
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${suffix}-05b-visa-settings-preview-history.png`), fullPage: true });
    await page.getByRole("button", { name: combination.locale === "ru" ? "Закрыть" : "Close" }).click();

    await page.getByRole("button", { name: combination.locale === "ru" ? "Услуги" : "Services", exact: true }).click();
    const serviceCard = page.locator(".admin-settings .admin-entity-card").first();
    await serviceCard.getByRole("button", { name: combination.locale === "ru" ? "Изменить" : "Edit", exact: true }).click();
    await page.getByLabel(combination.locale === "ru" ? "Описание" : "Description").fill(combination.locale === "ru" ? "Проверенное описание" : "Verified description");
    await page.getByLabel(combination.locale === "ru" ? "Причина изменения" : "Change reason").fill(combination.locale === "ru" ? "Проверка услуги" : "Service review");
    await page.getByRole("button", { name: combination.locale === "ru" ? "Предпросмотр" : "Preview", exact: true }).click();
    await page.getByText(combination.locale === "ru" ? "История и восстановление" : "History and restore").click();
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${suffix}-05c-service-settings-preview-history.png`), fullPage: true });
    await page.getByRole("button", { name: combination.locale === "ru" ? "Закрыть" : "Close" }).click();

    await page.getByRole("button", { name: combination.locale === "ru" ? "Обменник" : "Exchange", exact: true }).click();
    await page.locator(".admin-exchange-management").getByRole("button", { name: combination.locale === "ru" ? "Изменить с предпросмотром" : "Edit with preview" }).first().click();
    await page.getByLabel(combination.locale === "ru" ? /Комиссия SAFRWAY, %/ : /SAFRWAY fee, %/).fill("4.5");
    await page.getByLabel(combination.locale === "ru" ? "Причина изменения" : "Change reason").fill(combination.locale === "ru" ? "Проверка маршрута" : "Route review");
    await page.getByRole("button", { name: combination.locale === "ru" ? "Предпросмотр" : "Preview", exact: true }).click();
    await page.getByText(combination.locale === "ru" ? "История и восстановление" : "History and restore").click();
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${suffix}-05d-exchange-settings-preview-history.png`), fullPage: true });
    await page.getByRole("button", { name: combination.locale === "ru" ? "Закрыть" : "Close" }).click();

    await page.getByRole("button", { name: combination.locale === "ru" ? "Уведомления" : "Notifications", exact: true }).click();
    await expect(page.getByText(combination.locale === "ru" ? /Переключатель согласия находится в карточке каждой визы/ : /Consent is managed per visa case/).first()).toBeVisible();
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${suffix}-05e-notification-settings-boundary.png`), fullPage: true });
    await page.close();
  }
});

test("BALI-TASK-067 Admin honors reduced motion and visible keyboard focus", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await installFixture(page, "en", "dark");
  await page.goto("/admin/clients/");
  await expect(page.getByRole("heading", { name: "Clients" }).last()).toBeVisible();
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement !== document.body)) break;
  }
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  const style = await focused.evaluate((node) => getComputedStyle(node as HTMLElement).outlineStyle);
  expect(style).not.toBe("none");
  const motion = await page.locator("body").evaluate((node) => getComputedStyle(node).scrollBehavior);
  expect(motion).not.toBe("smooth");
  await page.screenshot({ path: path.join(artifactRoot, "iphone-390", "en-dark-reduced-motion-focus.png"), fullPage: true });
  await page.close();
});

const stateCombinations = [
  { locale: "ru" as const, theme: "dark" as const },
  { locale: "en" as const, theme: "light" as const },
];

async function openClientCase(page: Page, archived = false) {
  if (archived) {
    await page.goto("/admin/visa-archive/");
    await page.locator(".admin-archive-card .admin-card-main").first().click();
    return;
  }
  await page.goto("/admin/clients/");
  await page.locator(".crm-client-card-button").first().click();
  await page.locator(".crm-case-row > button").first().click();
}

async function assertProtectedDocumentSheet(page: Page, locale: "ru" | "en") {
  const editor = page.locator(".admin-overlay > .crm-visa-editor");
  const documents = page.locator(".crm-documents");
  await expect(editor).toBeVisible();
  await documents.evaluate((node) => node.scrollIntoView({ block: "start" }));
  await expect(page.getByRole("heading", { name: locale === "ru" ? "Редактировать визу" : "Edit visa" })).toBeVisible();
  await expect(page.getByRole("heading", { name: locale === "ru" ? "Защищённые документы" : "Protected documents" })).toBeVisible();
  const geometry = await page.evaluate(() => {
    const editorNode = document.querySelector<HTMLElement>(".admin-overlay > .crm-visa-editor")!;
    const documentNode = document.querySelector<HTMLElement>(".crm-documents")!;
    const titleNode = document.querySelector<HTMLElement>(".admin-overlay > .crm-visa-editor > .crm-editor-title")!;
    const mobileNav = document.querySelector<HTMLElement>(".admin-mobile");
    const editorBox = editorNode.getBoundingClientRect();
    const documentBox = documentNode.getBoundingClientRect();
    const titleBox = titleNode.getBoundingClientRect();
    const style = getComputedStyle(editorNode);
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      editor: { left: editorBox.left, right: editorBox.right, top: editorBox.top, bottom: editorBox.bottom },
      documents: { left: documentBox.left, right: documentBox.right, top: documentBox.top },
      title: { top: titleBox.top, bottom: titleBox.bottom },
      overflowY: style.overflowY,
      background: style.backgroundColor,
      mobileNavVisibility: mobileNav ? getComputedStyle(mobileNav).visibility : "absent",
    };
  });
  expect(geometry.editor.left).toBeGreaterThanOrEqual(7);
  expect(geometry.editor.right).toBeLessThanOrEqual(geometry.viewportWidth - 7);
  expect(geometry.editor.top).toBeGreaterThanOrEqual(7);
  expect(geometry.editor.bottom).toBeLessThanOrEqual(geometry.viewportHeight - 7);
  expect(geometry.title.top).toBeGreaterThanOrEqual(geometry.editor.top);
  expect(geometry.title.bottom).toBeLessThan(geometry.editor.bottom);
  expect(geometry.documents.left).toBeGreaterThanOrEqual(geometry.editor.left);
  expect(geometry.documents.right).toBeLessThanOrEqual(geometry.editor.right);
  expect(geometry.documents.top).toBeGreaterThanOrEqual(geometry.title.bottom);
  expect(geometry.overflowY).toBe("auto");
  expect(geometry.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(geometry.mobileNavVisibility).not.toBe("visible");
}

test("BALI-TASK-067 Visa Archive delete safety states", async ({ browser }) => {
  for (const size of sizes) for (const combination of stateCombinations) for (const mode of ["pending", "error", "success"] as const) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await installFixture(page, combination.locale, combination.theme, { deleteMode: mode });
    await openClientCase(page, true);
    await expect(page.getByRole("button", { name: combination.locale === "ru" ? "← Архив виз" : "← Visa archive" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Previous B1" })).toBeVisible();
    const deleteButton = page.getByRole("button", { name: combination.locale === "ru" ? /Удалить навсегда/ : /Delete permanently/ });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    await expect(page.getByRole("heading", { name: combination.locale === "ru" ? "Удалить архивную визу навсегда?" : "Permanently delete this archived visa?" })).toBeVisible();
    await expect(page.locator(".crm-delete-confirm dl")).toContainText(combination.locale === "ru" ? "Процессы визы" : "Visa processes");
    await page.getByLabel(combination.locale === "ru" ? "Причина" : "Reason").fill(combination.locale === "ru" ? "Проверенное удаление из архива" : "Verified archive deletion");
    await page.getByRole("button", { name: combination.locale === "ru" ? "Удалить навсегда" : "Delete permanently", exact: true }).click();
    if (mode === "pending") await expect(page.getByRole("button", { name: combination.locale === "ru" ? "Удаляем…" : "Deleting…" })).toBeDisabled();
    if (mode === "error") await expect(page.getByRole("alert")).toContainText(combination.locale === "ru" ? "Версия изменилась" : "version changed", { ignoreCase: true });
    if (mode === "success") await expect(page.getByRole("status")).toContainText(combination.locale === "ru" ? "Архивная виза удалена" : "archived visa was deleted", { ignoreCase: true });
    await assertViewport(page, combination.theme);
    const target = path.join(artifactRoot, size.name, `${combination.locale}-${combination.theme}-06-archive-delete-${mode}.png`);
    await page.screenshot({ path: target, fullPage: true });
    await page.close();
  }
});

test("BALI-TASK-067 protected document lifecycle states", async ({ browser }) => {
  for (const size of sizes) for (const combination of stateCombinations) {
    const unconfigured = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await installFixture(unconfigured, combination.locale, combination.theme, { storageReady: false });
    await openClientCase(unconfigured);
    await expect(unconfigured.getByText(combination.locale === "ru" ? /Загрузка заблокирована/ : /Upload is blocked/)).toBeVisible();
    await expect(unconfigured.locator('.crm-document-upload input[type="file"]')).toBeDisabled();
    await expect(unconfigured.locator('.crm-document-upload button')).toBeDisabled();
    await assertProtectedDocumentSheet(unconfigured, combination.locale);
    await assertViewport(unconfigured, combination.theme);
    await unconfigured.screenshot({ path: path.join(artifactRoot, size.name, `${combination.locale}-${combination.theme}-07-documents-unconfigured.png`) });
    await unconfigured.close();

    for (const mode of ["pending", "accepted", "rejected", "error"] as const) {
      const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
      await installFixture(page, combination.locale, combination.theme, { storageReady: true, uploadMode: mode });
      await openClientCase(page);
      const fileInput = page.locator('.crm-document-upload input[type="file"]');
      await fileInput.setInputFiles({ name: "fixture.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nfixture\n") });
      const uploadButton = page.getByRole("button", { name: combination.locale === "ru" ? "Проверить и загрузить" : "Scan and upload" });
      await expect(uploadButton).toBeEnabled();
      await uploadButton.click({ noWaitAfter: mode === "pending" });
      const uploadStatus = page.locator('.crm-document-upload [role="status"]');
      if (mode === "pending") {
        await expect(page.getByRole("button", { name: combination.locale === "ru" ? /Карантин → сканирование/ : /Quarantine → scan/ })).toBeDisabled();
        await expect(uploadStatus).toContainText(combination.locale === "ru" ? "карантине" : "quarantined");
      }
      if (mode === "accepted") await expect(uploadStatus).toContainText(combination.locale === "ru" ? "Файл принят" : "file was accepted", { ignoreCase: true });
      if (mode === "rejected") { await expect(page.getByRole("alert")).toContainText(combination.locale === "ru" ? "отклонён сканером" : "scanner rejected"); await expect(page.getByRole("button", { name: combination.locale === "ru" ? "Повторить загрузку" : "Retry upload" })).toBeVisible(); }
      if (mode === "error") { await expect(page.getByRole("alert")).toContainText(combination.locale === "ru" ? "Не удалось загрузить" : "Could not upload"); await expect(page.getByRole("button", { name: combination.locale === "ru" ? "Повторить загрузку" : "Retry upload" })).toBeVisible(); }
      await expect(page.getByText(combination.locale === "ru" ? /видит клиент/ : /client visible/).first()).toBeVisible();
      await expect(page.getByRole("link", { name: combination.locale === "ru" ? "Скачать защищённо" : "Secure download" })).toBeVisible();
      await assertProtectedDocumentSheet(page, combination.locale);
      const stateButton = page.locator(".crm-document-upload > button");
      const stateButtonBox = await stateButton.boundingBox();
      expect(stateButtonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (mode === "accepted") {
        const downloadLink = page.getByRole("link", { name: combination.locale === "ru" ? "Скачать защищённо" : "Secure download" });
        await downloadLink.focus(); await expect(downloadLink).toBeFocused();
      } else if (mode === "rejected" || mode === "error") {
        await stateButton.focus(); await expect(stateButton).toBeFocused();
      }
      await uploadStatus.evaluate((node) => node.scrollIntoView({ block: "center" }));
      const mutationGeometry = await page.evaluate(() => {
        const title = document.querySelector<HTMLElement>(".crm-editor-title")!.getBoundingClientRect();
        const action = document.querySelector<HTMLElement>(".crm-document-upload > button")!.getBoundingClientRect();
        const status = document.querySelector<HTMLElement>('.crm-document-upload [role="status"]')!.getBoundingClientRect();
        const saveBar = document.querySelector<HTMLElement>(".crm-save-actions")!.getBoundingClientRect();
        return { titleBottom: title.bottom, actionTop: action.top, actionBottom: action.bottom, statusTop: status.top, statusBottom: status.bottom, saveTop: saveBar.top };
      });
      expect(mutationGeometry.actionTop).toBeGreaterThanOrEqual(mutationGeometry.titleBottom);
      expect(mutationGeometry.actionBottom).toBeLessThanOrEqual(mutationGeometry.saveTop);
      expect(mutationGeometry.statusTop).toBeGreaterThanOrEqual(mutationGeometry.titleBottom);
      expect(mutationGeometry.statusBottom).toBeLessThanOrEqual(mutationGeometry.saveTop);
      await assertViewport(page, combination.theme);
      await page.screenshot({ path: path.join(artifactRoot, size.name, `${combination.locale}-${combination.theme}-07-documents-${mode}.png`) });
      await page.close();
    }
  }
});

test("BALI-TASK-067 referral correction pending error success states", async ({ browser }) => {
  for (const size of sizes) for (const combination of stateCombinations) for (const mode of ["pending", "error", "success"] as const) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await installFixture(page, combination.locale, combination.theme, { correctionMode: mode });
    await page.goto("/admin/referrals/");
    await page.getByText(combination.locale === "ru" ? "Доступный список связей" : "Accessible relationship list").click();
    await page.getByText(combination.locale === "ru" ? "Исправить подтверждённую атрибуцию" : "Correct verified attribution").click();
    await page.getByLabel(combination.locale === "ru" ? "SAFRWAY ID клиента" : "Client SAFRWAY ID").fill("22");
    await page.getByLabel(combination.locale === "ru" ? "SAFRWAY ID нового пригласившего" : "New inviter SAFRWAY ID").fill("1");
    await page.getByRole("button", { name: combination.locale === "ru" ? "Проверить без записи" : "Preview without writing" }).click();
    await page.getByLabel(combination.locale === "ru" ? "Основание и причина" : "Evidence and reason").fill(combination.locale === "ru" ? "Проверенное основание" : "Verified evidence");
    await page.getByRole("checkbox", { name: combination.locale === "ru" ? /Подтверждаю/ : /I confirm/ }).check();
    await page.getByRole("button", { name: combination.locale === "ru" ? "Применить одну коррекцию" : "Apply one correction" }).click();
    if (mode === "pending") await expect(page.getByRole("button", { name: combination.locale === "ru" ? "Применяем…" : "Applying…" })).toBeDisabled();
    if (mode === "error") await expect(page.getByRole("alert")).toContainText(combination.locale === "ru" ? "Связь изменилась" : "Relationship changed");
    if (mode === "success") await expect(page.getByRole("status")).toContainText(combination.locale === "ru" ? "Атрибуция исправлена" : "Attribution corrected");
    await assertViewport(page, combination.theme);
    await page.screenshot({ path: path.join(artifactRoot, size.name, `${combination.locale}-${combination.theme}-08-referral-correction-${mode}.png`), fullPage: true });
    await page.close();
  }
});
