import { createRefreshLoop } from "../../../shared/runtime/refresh-loop";

const PRICE_SELECTOR = "[data-canonical-price]";

let projection = null;
let expiryTimer = null;

function validProjection(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.projection_id === "string" &&
      Number.isInteger(value.catalog_version_id) &&
      Number.isInteger(value.fx_snapshot_id) &&
      typeof value.derived_expires_at === "string" &&
      Array.isArray(value.items),
  );
}

function localized(locale, ru, en) {
  return locale === "en" ? en : ru;
}

function priceText(node, activeProjection) {
  const locale = document.documentElement.lang === "en" ? "en" : "ru";
  const entityType = node.dataset.entityType;
  const entityKey = node.dataset.entityKey;
  const matches = activeProjection.items
    .filter((item) =>
      item &&
      item.entity_type === entityType &&
      item.entity_key === entityKey,
    )
    .sort((left, right) =>
      Number(left.sort_order || 0) - Number(right.sort_order || 0) ||
      String(left.sku || "").localeCompare(String(right.sku || "")),
    );
  const visible = matches.filter((item) => item.show_price && item.amount_idr);
  if (!visible.length) {
    return matches.some((item) => item.price_qualifier === "CONTACT")
      ? localized(locale, "Цена по запросу", "Price on request")
      : "";
  }
  const lowest = visible.reduce((left, right) =>
    BigInt(left.amount_idr) <= BigInt(right.amount_idr) ? left : right,
  );
  const formattedIdr = new Intl.NumberFormat(locale === "en" ? "en-US" : "ru-RU", {
    maximumFractionDigits: 0,
  }).format(Number(lowest.amount_idr));
  const prefix = visible.length > 1 || lowest.price_qualifier === "FROM"
    ? localized(locale, "от ", "from ")
    : "";
  const expiry = Date.parse(activeProjection.derived_expires_at);
  const derivedAllowed = Number.isFinite(expiry) && Date.now() <= expiry;
  const usdt = derivedAllowed && lowest.display_usdt
    ? ` · ≈ ${lowest.display_usdt} USDT`
    : "";
  return `${prefix}${formattedIdr} IDR${usdt}`;
}

function render() {
  const locale = document.documentElement.lang === "en" ? "en" : "ru";
  for (const node of document.querySelectorAll(PRICE_SELECTOR)) {
    const value = projection
      ? priceText(node, projection)
      : localized(locale, "Цена временно недоступна", "Price temporarily unavailable");
    node.textContent = value;
    node.hidden = !value;
    if (projection) {
      node.dataset.projectionId = projection.projection_id;
      node.dataset.catalogVersion = String(projection.catalog_version_id);
      node.dataset.fxVersion = String(projection.fx_snapshot_id);
    }
  }
}

function scheduleExpiry() {
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  if (!projection) return;
  const expiry = Date.parse(projection.derived_expires_at);
  if (!Number.isFinite(expiry)) return;
  expiryTimer = window.setTimeout(
    render,
    Math.max(0, Math.min(expiry - Date.now() + 25, 2_147_000_000)),
  );
}

function startPricing() {
  if (!document.querySelector(PRICE_SELECTOR)) return;
  const loop = createRefreshLoop({
    async load(signal) {
    const response = await fetch("/api/catalog/pricing", {
      signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) throw new Error(`pricing projection ${response.status}`);
    const next = await response.json();
    if (!validProjection(next)) throw new Error("invalid pricing projection");
    return next;
    },
    onValue(next) {
    projection = next;
    render();
    scheduleExpiry();
    },
    // Wake/expiry rendering removes untrusted derived amounts even offline.
    onWake: render,
    onSettled: render,
  });
  render();
  loop.start();
  window.addEventListener("pagehide", () => { loop.stop(); window.clearTimeout(expiryTimer); });
  window.addEventListener("pageshow", () => { render(); scheduleExpiry(); loop.start(); });
}
startPricing();
