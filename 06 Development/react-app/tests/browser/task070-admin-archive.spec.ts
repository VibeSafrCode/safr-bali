import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactRoot = path.resolve("../artifacts/BALI-TASK-070/designer-review/admin-archive");

const archivedItems = Array.from({ length: 8 }, (_, index) => ({
  id: 70 + index,
  user_id: 10 + index,
  country_code: "ID",
  custom_visa_name: index === 0 ? "Very long archived Indonesia visa name that must wrap inside its own card" : undefined,
  visa_type: { code: index % 2 ? "E33G" : "B1", name: index % 2 ? "Remote worker ITAS" : "B1 short stay" },
  service_status: index % 2 ? "COMPLETED" : "CANCELLED",
  lifecycle_status: index % 2 ? "EXPIRED" : "CANCELLED",
  publication_status: "ARCHIVED",
  next_action_text: "No further action",
  archived_at: `2026-08-${String(20 - index).padStart(2, "0")}T10:00:00Z`,
  updated_at: `2026-08-${String(20 - index).padStart(2, "0")}T10:00:00Z`,
  version: 4,
  client: { id: 10 + index, name: `Client ${index + 1}`, username: `client${index + 1}`, telegram_id_mask: `••••${1000 + index}` },
}));

async function respond(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockArchive(page: Page, locale: "ru" | "en") {
  await page.route("**/api/web/admin/session", (route) => respond(route, 200, { authenticated: true, actor: { first_name: "Root", role: "admin", locale, allowed_tabs: ["clients"] }, csrf_token: "fixture" }));
  await page.route(/\/api\/web\/admin\/visa-cases\/archive(?:\?.*)?$/, (route) => respond(route, 200, { items: archivedItems, total: archivedItems.length, page: 1 }));
}

for (const matrix of [
  { width: 320, columns: 1, locale: "ru" as const, theme: "dark" },
  { width: 320, columns: 1, locale: "en" as const, theme: "light" },
  { width: 390, columns: 1, locale: "en" as const, theme: "light" },
  { width: 390, columns: 1, locale: "ru" as const, theme: "dark" },
  { width: 680, columns: 2, locale: "ru" as const, theme: "light" },
  { width: 768, columns: 3, locale: "en" as const, theme: "dark" },
  { width: 768, columns: 3, locale: "ru" as const, theme: "light" },
  { width: 1440, columns: 4, locale: "ru" as const, theme: "dark" },
  { width: 1440, columns: 4, locale: "en" as const, theme: "light" },
]) {
  test(`archive cards are contained at ${matrix.width}px in ${matrix.locale}/${matrix.theme}`, async ({ page }) => {
    await page.setViewportSize({ width: matrix.width, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem("safrway:appearance", theme), matrix.theme);
    await mockArchive(page, matrix.locale);
    await page.goto("/admin/visa-archive/");
    await expect(page.getByRole("heading", { name: matrix.locale === "ru" ? "Архив виз" : "Visa archive", level: 1 })).toBeVisible();
    const grid = page.locator(".admin-archive-grid");
    await expect(grid).toBeVisible();
    if (matrix.width <= 900) {
      const mobileNav = page.getByRole("navigation", { name: matrix.locale === "ru" ? "Мобильная навигация" : "Mobile navigation" });
      const archiveEntry = mobileNav.getByRole("button", { name: matrix.locale === "ru" ? "Архив виз" : "Visa archive" });
      await expect(archiveEntry).toBeVisible();
      await expect(archiveEntry).toHaveAttribute("aria-current", "page");
      const navBox = await mobileNav.boundingBox(); const gridBox = await grid.boundingBox(); const archiveBox = await archiveEntry.boundingBox();
      expect(archiveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(gridBox!.y);
    }
    expect(await grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length)).toBe(matrix.columns);
    const geometry = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth, cards: [...document.querySelectorAll<HTMLElement>(".admin-archive-card")].map((card) => { const box = card.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, width: box.width, scroll: card.scrollWidth }; }) }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
    for (const card of geometry.cards) {
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(geometry.viewport);
      expect(card.scroll).toBeLessThanOrEqual(Math.ceil(card.width));
    }
    for (let index = 1; index < geometry.cards.length; index += 1) {
      const previous = geometry.cards[index - 1]; const current = geometry.cards[index];
      if (Math.abs(previous.top - current.top) < 2) expect(current.left).toBeGreaterThanOrEqual(previous.right - 1);
    }
    await expect(page.locator(".admin-archive-card .admin-card-link").first()).toHaveCSS("min-height", "44px");
    await mkdir(artifactRoot, { recursive: true });
    await page.screenshot({ path: path.join(artifactRoot, `${matrix.width}-${matrix.locale}-${matrix.theme}-archive-list.png`), fullPage: true });
  });
}

test("archive filters, detail-safe route, restore confirmation and focus return are explicit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("safrway:appearance", "light"));
  await mockArchive(page, "en");
  let restoreBody: Record<string, unknown> | null = null;
  await page.route("**/api/web/admin/visa-cases/70/publication/hide", async (route) => { restoreBody = route.request().postDataJSON(); await respond(route, 200, { ...archivedItems[0], publication_status: "HIDDEN", version: 5 }); });
  await page.goto("/admin/visa-archive/?sort=archived_asc");
  await expect(page.getByLabel("Sort")).toHaveValue("archived_asc");
  await page.getByLabel(/Search by client/).fill("Client 1");
  await page.getByLabel("Service status").selectOption("CANCELLED");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("service_status")).toBe("CANCELLED");
  const open = page.getByRole("button", { name: /Very long archived/ });
  await open.click();
  await expect(page).toHaveURL(/\/admin\/visa-archive\/70\//);
  const restore = page.getByRole("button", { name: "Restore from archive" });
  await expect(page.locator(".admin-archive-facts").getByText("CANCELLED", { exact: true })).toHaveCount(1);
  await restore.focus(); await restore.click();
  const dialog = page.getByRole("dialog", { name: "Return this visa to work?" });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.locator(".admin-dialog").boundingBox();
  expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(8); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(382);
  await expect(page.getByLabel("Reason")).toBeFocused();
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.join(artifactRoot, "390-en-light-restore-confirmation.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(restore).toBeFocused();
  await restore.click(); await page.getByLabel("Reason").fill("Return to active team work");
  await page.getByRole("button", { name: "Yes, restore to work" }).click();
  await expect.poll(() => restoreBody).toMatchObject({ notify_client: false, reason: "Return to active team work" });
  const outcome = page.getByRole("status");
  await expect(outcome).toContainText("without notifying the client");
  await expect(outcome).toBeFocused();
  expect(await outcome.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.join(artifactRoot, "390-en-light-restore-success-focus.png"), fullPage: true });
});

test("permanent delete is root-only from Archive and stays fail-closed until preview passes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("safrway:appearance", "dark"));
  await mockArchive(page, "ru");
  let deleteBody: Record<string, unknown> | null = null;
  await page.route("**/api/web/admin/visa-cases/70/delete-preview", (route) => respond(route, 200, { case_id: 70, visa_type_code: "B1", dependency_counts: { visa_processes: 1, visa_events: 3, visa_notification_deliveries: 0, visa_documents: 0 }, unexpected_dependencies: [], protected_files_present: false, executable: true }));
  await page.route("**/api/web/admin/visa-cases/70/permanent-delete", async (route) => { deleteBody = route.request().postDataJSON(); await respond(route, 200, { deleted: true, visa_case_id: 70, tombstone_id: 9 }); });
  await page.goto("/admin/visa-archive/");
  await page.getByRole("button", { name: /Very long archived/ }).click();
  const trigger = page.getByRole("button", { name: "Удалить навсегда…" });
  expect((await trigger.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Удалить архивную визу навсегда?" });
  await expect(dialog).toContainText("Клиент, заказы, рефералы, Points, диалоги и другие визы останутся");
  await expect(dialog).toContainText("Процессы визы");
  await expect(dialog).not.toContainText("visa processes");
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.join(artifactRoot, "1440-ru-dark-delete-confirmation.png") });
  await page.getByLabel("Причина").fill("Duplicate archived test record");
  await page.getByRole("button", { name: "Удалить навсегда", exact: true }).click();
  await expect.poll(() => deleteBody).toMatchObject({ confirm_case_id: 70, expected_version: 4, reason: "Duplicate archived test record" });
  const outcome = page.getByRole("status");
  await expect(outcome).toContainText("Минимальная запись аудита сохранена");
  await expect(outcome).toBeFocused();
  expect(await outcome.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.join(artifactRoot, "1440-ru-dark-delete-success-focus.png"), fullPage: true });
});

test("archive confirmation respects reduced motion and keeps a visible focus target", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("safrway:appearance", "dark"));
  await mockArchive(page, "ru");
  await page.goto("/admin/visa-archive/");
  await page.locator(".admin-archive-card .admin-card-main").first().click();
  const restore = page.getByRole("button", { name: "Вернуть из архива" });
  await restore.click();
  await page.getByLabel("Причина").fill("Проверка фокуса");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(restore).toBeFocused();
  const motion = await page.locator(".admin-archive-detail").evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(["0s", "0ms", ""]).toContain(motion);
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.join(artifactRoot, "390-ru-dark-reduced-motion-focus-return.png") });
});

test("mobile permanent-delete confirmation is bounded, scrollable and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("safrway:appearance", "light"));
  await mockArchive(page, "ru");
  await page.route("**/api/web/admin/visa-cases/70/delete-preview", (route) => respond(route, 200, { case_id: 70, visa_type_code: "B1", dependency_counts: { visa_processes: 1, visa_events: 3, visa_notification_deliveries: 2, visa_documents: 0, visa_case_dates: 2 }, unexpected_dependencies: [], protected_files_present: false, executable: true }));
  await page.goto("/admin/visa-archive/");
  await page.locator(".admin-archive-card .admin-card-main").first().click();
  const trigger = page.getByRole("button", { name: "Удалить навсегда…" });
  await trigger.focus(); await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Удалить архивную визу навсегда?" });
  const sheet = dialog.locator(".admin-dialog");
  await expect(page.getByLabel("Причина")).toBeFocused();
  const geometry = await sheet.evaluate((node) => { const box = node.getBoundingClientRect(); const style = getComputedStyle(node); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, overflowY: style.overflowY, scrollHeight: (node as HTMLElement).scrollHeight, clientHeight: (node as HTMLElement).clientHeight, documentWidth: document.documentElement.scrollWidth }; });
  expect(geometry.left).toBeGreaterThanOrEqual(8); expect(geometry.right).toBeLessThanOrEqual(382);
  expect(geometry.top).toBeGreaterThanOrEqual(8); expect(geometry.bottom).toBeLessThanOrEqual(836);
  expect(["auto", "scroll"]).toContain(geometry.overflowY);
  expect(geometry.documentWidth).toBeLessThanOrEqual(390);
  const actions = dialog.locator(".admin-dialog-actions button");
  for (const button of await actions.all()) expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await sheet.evaluate((node) => { (node as HTMLElement).scrollTop = (node as HTMLElement).scrollHeight; });
  await expect(actions.last()).toBeVisible();
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.join(artifactRoot, "390-ru-light-delete-confirmation-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("ordinary client detail never renders archived cases", async ({ page }) => {
  await page.route("**/api/web/admin/session", (route) => respond(route, 200, { authenticated: true, actor: { first_name: "Root", role: "admin", locale: "ru", allowed_tabs: ["clients"] }, csrf_token: "fixture" }));
  await page.route(/\/api\/web\/admin\/clients(?:\?.*)?$/, (route) => respond(route, 200, { items: [{ id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }], total: 1 }));
  await page.route("**/api/web/admin/visa-cases/types", (route) => respond(route, 200, { items: [] }));
  await page.route("**/api/web/admin/visa-cases/document-storage/readiness", (route) => respond(route, 200, { storage_configured: false, storage_private: false, encryption_configured: false, key_versioned: false, key_custody_confirmed: false, scanner_configured: false, retention_configured: false, backup_restore_verified: false, ready: false, max_bytes: 0 }));
  await page.route("**/api/web/admin/visa-cases/staff/visa-managers", (route) => respond(route, 200, { enabled: false, items: [] }));
  await page.route("**/api/web/admin/clients/5", (route) => respond(route, 200, { client: { id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }, visa_cases: [{ ...archivedItems[0], id: 80, custom_visa_name: "Archived case must stay out", publication_status: "ARCHIVED" }, { ...archivedItems[1], id: 81, custom_visa_name: "Current case remains", publication_status: "PUBLISHED" }], notes: [], credentials: [], dialogue: { id: null, status: "empty", messages: [] } }));
  await page.goto("/admin/clients/");
  await page.getByRole("button", { name: /Fixture/ }).click();
  await expect(page.getByText("Current case remains")).toBeVisible();
  await expect(page.getByText("Archived case must stay out")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Удалить навсегда/ })).toHaveCount(0);
});
