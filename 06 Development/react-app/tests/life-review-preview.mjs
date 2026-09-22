// Local design-review fixture only. Never used by production builds.
// Every API request is intercepted here; mutations are rejected without messages.
import { createServer } from "vite";

const client = { id: 5, first_name: "Тестовый клиент", username: "fixture_client", telegram_id_mask: "••••0005", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false };
const dashboard = { telegram_id: 5, first_name: "Тестовый клиент", username: "fixture_client", locale: "ru", balance: 0, referral_count: 0, orders: [] };
const base = { user_id: 5, description: "Синтетический пример для проверки интерфейса.", link_url: "https://example.com/", start_date: "2026-09-22", end_date: "2026-10-30", price_amount: "2500000.00", price_currency: "IDR", price_unit: "month", public_contact: "Менеджер SAFRWAY", publication_status: "PUBLISHED", version: 1, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z", owner_details: "Внутренний тестовый контакт", internal_note: "Только локальный тест" };
const life = [{ ...base, id: 21, kind: "bike", title: "Yamaha NMAX" }, { ...base, id: 22, kind: "housing", title: "Вилла у рисовых полей", price_amount: "18000000.00", end_date: "2026-11-22" }, { ...base, id: 23, kind: "insurance", title: "Страховая компания · тестовый полис", start_date: null, end_date: "2027-03-01", price_amount: "120.00", price_currency: "USD", price_unit: "policy" }];
const visas = [{ id: 41, user_id: 5, country_code: "ID", visa_type: { code: "B1", name: "B1", version: 1 }, lifecycle_status: "ACTIVE", service_status: "COMPLETED", publication_status: "PUBLISHED", notifications_enabled: true, entered_on: "2026-09-01", entry_deadline: "2026-10-01", stay_end: "2026-11-15", version: 1 }];
const json = (res, status, value) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
const fixture = {
  name: "life-review-fixtures",
  transformIndexHtml(html) {
    return html.replace(/<script\s+src="https:\/\/telegram\.org[\s\S]*?<\/script>/, "")
      .replace("<head>", '<head><script>window.Telegram={WebApp:{initData:"local-fixture",ready(){},expand(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}}}};</script>');
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = new URL(req.url, "http://localhost").pathname;
      const api = path.startsWith("/api/") || path.startsWith("/mini-app/");
      if (api && req.method !== "GET") return json(res, 409, { detail: "Local design preview: writes and messages are disabled" });
      if (path === "/build-version.json") return json(res, 200, { build_id: "local" });
      if (path === "/api/web/admin/session") return json(res, 200, { authenticated: true, actor: { role: "admin", first_name: "Локальный просмотр", locale: "ru" }, csrf_token: "fixture-only" });
      if (path === "/api/web/admin/clients") return json(res, 200, { items: [client], total: 1 });
      if (path === "/api/web/admin/clients/5") return json(res, 200, { client, visa_cases: visas, notes: [], credentials: [], dialogue: { id: null, status: "empty", messages: [] } });
      if (path === "/api/web/admin/clients/5/life-services") return json(res, 200, { items: life });
      if (/^\/api\/web\/admin\/clients\/5\/life-services\/\d+$/.test(path)) return json(res, 200, life.find((item) => item.id === Number(path.split("/").at(-1))));
      if (["/api/web/life-services", "/mini-app/life-services"].includes(path)) return json(res, 200, { items: life.map(({ owner_details, internal_note, ...item }) => item) });
      if (["/api/web/visa-cases", "/mini-app/visa-cases"].includes(path)) return json(res, 200, { items: visas });
      if (path === "/api/web/auth/me") return json(res, 200, { authenticated: true, telegram_id: 5, csrf_token: "fixture-only" });
      if (["/api/web/account", "/mini-app/me"].includes(path)) return json(res, 200, dashboard);
      if (path === "/api/web/admin/visa-cases/staff/visa-managers") return json(res, 200, { items: [], enabled: false });
      if (path === "/api/web/admin/visa-cases/document-storage/readiness") return json(res, 200, { ready: false });
      if (api) return json(res, 200, { items: [], total: 0 });
      if (/^\/admin\/.+\/$/.test(path)) req.url = "/admin/index.html";
      if (/^\/account\/.+\/$/.test(path)) req.url = "/account/index.html";
      next();
    });
  },
};
const server = await createServer({ plugins: [fixture], server: { host: "127.0.0.1", port: 4368, strictPort: true } });
await server.listen();
console.log("BALI-LIFE local design preview: http://127.0.0.1:4368/admin/clients/5/ and /account/profile/life/ and /#/profile/life");
