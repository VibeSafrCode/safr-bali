import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const visualRoot = path.resolve("../artifacts/BALI-TASK-066/designer-review/react/cpo-corrections");

async function adminSession(page: import("@playwright/test").Page) {
  await page.route("**/api/web/admin/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, actor: { first_name: "Root Admin", role: "admin", locale: "ru" }, csrf_token: "fixture" }),
  }));
  await page.route("**/api/web/locale", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locale: "ru" }) }));
}

test("notification settings expose per-case scope instead of a fictional global enabled flag", async ({ page }) => {
  await adminSession(page);
  await page.route("**/api/web/admin/settings", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ exchange_routes: [], visa_types: [], services: [], notifications: [{ event: "CASE_UPDATED", audience: "client", delivery: "Telegram", enabled: null, configuration_scope: "per_case", editable: false }] }),
  }));
  await page.goto("/admin/settings/");
  await page.getByRole("button", { name: "Уведомления" }).click();
  await expect(page.getByText("Переключатель согласия находится в карточке каждой визы. UNKNOWN никогда не повторяется автоматически.")).toBeVisible();
  await expect(page.getByText("Включено", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Выключено", { exact: true })).toHaveCount(0);
});

test("activity history renders actor object id comment and human before-after context", async ({ page }) => {
  await adminSession(page);
  await page.route("**/api/web/admin/audit**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ total: 1, items: [{ id: 8, actor_name: "Root Admin", action_type: "CONVERSATION_CLOSED", entity_type: "web_conversation", entity_id: 41, comment: "Вопрос решён", details: { before: { status: "open" }, after: { status: "closed" } }, created_at: "2026-08-24T10:00:00Z" }] }),
  }));
  await page.goto("/admin/audit/");
  await expect(page.getByText("Обращение клиента закрыто")).toBeVisible();
  await expect(page.getByText("Объект: Обращение клиента #41")).toBeVisible();
  await expect(page.getByText("Комментарий: Вопрос решён")).toBeVisible();
  await expect(page.getByText("Было: Статус: Открыто")).toBeVisible();
  await expect(page.getByText("Стало: Статус: Закрыто")).toBeVisible();
  await expect(page.getByText(/24 авг.*2026.*10:00.*UTC/)).toBeVisible();
  await expect(page.locator(".admin-entity-card")).not.toContainText(/web_conversation|\bopen\b|\bclosed\b|2026-08-24T10:00:00Z/);
  await expect(page.locator(".admin-audit-context")).not.toContainText("{");
  for (const name of ["Применить", "Сбросить"]) {
    const button = page.getByRole("button", { name });
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await button.focus();
    await expect(button).toBeFocused();
  }
});

test("client requests close and reopen with audit reason optimistic version and single-flight", async ({ page }) => {
  await adminSession(page);
  let status = "open";
  let updatedAt = "2026-08-24T10:00:00Z";
  const writes: Array<{ body: Record<string, unknown>; idempotency: string | null }> = [];
  let releaseFirstWrite: (() => void) | undefined;
  const firstWriteGate = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
  await page.route("**/api/web/admin/queues/visa", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 1, items: [{ id: 41, user_id: 5, client_name: "Полина", request_kind: "Visa", request_title: "Продление B1", status, updated_at: updatedAt }] }) });
  });
  await page.route("**/api/web/admin/conversations/41/status", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    writes.push({ body, idempotency: await route.request().headerValue("idempotency-key") });
    if (writes.length === 1) await firstWriteGate;
    status = String(body.status);
    updatedAt = status === "closed" ? "2026-08-24T10:01:00Z" : "2026-08-24T10:02:00Z";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 41, status, idempotent_replay: false }) });
  });

  await page.goto("/admin/queues/visa/");
  await page.getByRole("button", { name: "Закрыть обращение" }).click();
  const closeDialog = page.getByRole("dialog", { name: "Закрыть обращение?" });
  await closeDialog.getByLabel("Причина").fill("Вопрос решён");
  const close = closeDialog.getByRole("button", { name: "Закрыть обращение" });
  await close.click();
  await expect(closeDialog.getByRole("button", { name: "Сохраняем…" })).toBeDisabled();
  releaseFirstWrite?.();
  await expect(page.getByRole("button", { name: "Открыть снова" })).toBeVisible();

  await page.getByRole("button", { name: "Открыть снова" }).click();
  const reopenDialog = page.getByRole("dialog", { name: "Открыть обращение снова?" });
  await reopenDialog.getByLabel("Причина").fill("Клиент вернулся с вопросом");
  await reopenDialog.getByRole("button", { name: "Открыть снова" }).click();
  await expect(page.getByRole("button", { name: "Закрыть обращение" })).toBeVisible();

  expect(writes).toHaveLength(2);
  expect(writes[0].body).toEqual({ status: "closed", expected_updated_at: "2026-08-24T10:00:00Z", comment: "Вопрос решён" });
  expect(writes[1].body).toEqual({ status: "open", expected_updated_at: "2026-08-24T10:01:00Z", comment: "Клиент вернулся с вопросом" });
  expect(writes[0].idempotency).toBeTruthy();
  expect(writes[1].idempotency).toBeTruthy();
  expect(writes[0].idempotency).not.toBe(writes[1].idempotency);
});

test("Activity History correction packet is readable at mobile and desktop widths", async ({ browser }) => {
  await mkdir(visualRoot, { recursive: true });
  for (const size of [{ name: "iphone-390", width: 390, height: 844 }, { name: "desktop-1440", width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport: size, serviceWorkers: "block" });
    const page = await context.newPage();
    await adminSession(page);
    await page.route("**/api/web/admin/audit**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 1, items: [{ id: 8, actor_name: "Root Admin", action_type: "CONVERSATION_CLOSED", entity_type: "web_conversation", entity_id: 41, comment: "Вопрос решён", details: { before: { status: "open" }, after: { status: "closed" } }, created_at: "2026-08-24T10:00:00Z" }] }) }));

    await page.goto("/admin/audit/");
    await expect(page.getByText("Объект: Обращение клиента #41")).toBeVisible();
    await expect(page.getByText("Стало: Статус: Закрыто")).toBeVisible();
    await expect(page.locator(".admin-entity-card")).not.toContainText(/web_conversation|\bopen\b|\bclosed\b|2026-08-24T10:00:00Z/);
    for (const name of ["Применить", "Сбросить"]) {
      const button = page.getByRole("button", { name });
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(size.width);
      await button.focus();
      await expect(button).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(visualRoot, `${size.name}-activity-history.png`), fullPage: true });
    await context.close();
  }
});
