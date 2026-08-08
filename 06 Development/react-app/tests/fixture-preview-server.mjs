import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.SAFR_REACT_FIXTURE_PORT || 4323);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const dashboard = {
  telegram_id: 618,
  first_name: "Никита",
  username: "fixture",
  balance: 12500,
  referral_count: 3,
  referral_link: null,
  orders: [],
};

const exchangeOptions = {
  give: [
    { code: "IDR_CASH", label: "Рупии наличные" },
    { code: "RUB_BANK", label: "Рубли безналичные" },
    { code: "USDT", label: "USDT" },
  ],
  receive: [
    { code: "RUB_BANK", label: "Рубли безналичные" },
    { code: "IDR_CASH", label: "Рупии наличные" },
  ],
  supported_pairs: [
    {
      route_code: "IDR_CASH_TO_RUB_BANK",
      give_currency: "IDR_CASH",
      receive_currency: "RUB_BANK",
      amount_sides: ["give", "receive"],
      enabled: true,
    },
    {
      route_code: "RUB_BANK_TO_IDR_CASH",
      give_currency: "RUB_BANK",
      receive_currency: "IDR_CASH",
      amount_sides: ["give", "receive"],
      enabled: true,
    },
  ],
  manual_pairs_supported: true,
};

function json(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://fixture");
  const pathname = decodeURIComponent(url.pathname);

  if (request.method === "GET" && pathname === "/mini-app/me") {
    json(response, 200, dashboard);
    return;
  }
  if (request.method === "GET" && pathname === "/mini-app/chat") {
    json(response, 200, { id: null, status: "fixture", messages: [] });
    return;
  }
  if (request.method === "GET" && pathname === "/mini-app/exchange/options") {
    json(response, 200, exchangeOptions);
    return;
  }
  if (request.method === "POST" && pathname === "/mini-app/exchange/quotes") {
    json(response, 201, {
      quote_id: "fixture-preview-quote",
      route_code: "IDR_CASH_TO_RUB_BANK",
      mode: "GIVE",
      source_asset: "IDR_CASH",
      source_amount_display: "5150000",
      target_asset: "RUB_BANK",
      target_amount_display: "20021",
      status: "PRELIMINARY",
      manual_confirmation_required: true,
      calculated_at: "2026-08-07T00:00:00Z",
      expires_at: "2026-08-07T00:05:00Z",
      warning: "Локальный fixture: реальная заявка не создаётся.",
    });
    return;
  }
  if (
    request.method === "POST" &&
    (pathname === "/mini-app/chat/messages" ||
      pathname === "/mini-app/exchange/requests")
  ) {
    json(response, 409, { detail: "Fixture preview: writes are disabled" });
    return;
  }
  if (request.method === "GET" && pathname === "/api/web/admin/session") {
    json(response, 200, { authenticated: true, actor: { first_name: "Локальный admin", role: "admin" }, csrf_token: "fixture-only" });
    return;
  }
  if (request.method === "GET" && pathname === "/api/web/admin/dashboard") {
    json(response, 200, { new_users_7d: 2, orders_attention: 1, open_conversations: 0, referral_missing_rows: 0 });
    return;
  }
  if (request.method === "GET" && pathname === "/api/web/admin/orders") {
    json(response, 200, { total: 1, items: [{ id: 7, service: "Виза E33G", status: "new", payment_status: "pending", created_at: "2026-08-08T12:00:00Z" }] });
    return;
  }
  if (request.method === "GET" && pathname === "/api/web/admin/settings") {
    json(response, 200, { exchange_routes: [] });
    return;
  }
  if (request.method === "GET" && /^\/api\/web\/admin\/(?:users|referrals|points|audit|queues\/)/.test(pathname)) {
    json(response, 200, { total: 0, items: [], metrics: {} });
    return;
  }
  if (request.method !== "GET" && pathname.startsWith("/api/web/admin/")) {
    json(response, 409, { detail: "Fixture preview: admin writes are disabled" });
    return;
  }

  const safe = normalize(pathname)
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.(\/|\\|$))+/, "");
  let file = /^\/account\/(?:[A-Za-z0-9_-]+\/)*$/.test(pathname)
    ? join(root, "account/index.html")
    : /^\/admin\/(?:[A-Za-z0-9_-]+\/)*$/.test(pathname)
      ? join(root, "admin/index.html")
      : join(root, safe);
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`SAFR React fixture preview http://127.0.0.1:${port}\n`);
});
