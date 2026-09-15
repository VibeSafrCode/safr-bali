import assert from "node:assert/strict";
import test from "node:test";
import { compactPriceLabel, type PricingProjection } from "../src/pricing/runtime";

function projection(): PricingProjection {
  return {
    projection_id: "fixture", publication_version: 1, catalog_version_id: 1,
    catalog_version: 1, fx_snapshot_id: 7, formula_version: "exact-usdt-unchanged",
    accepted_at: new Date().toISOString(), derived_expires_at: "2099-01-01T00:00:00Z",
    max_refresh_lag_seconds: 60, currency: "IDR",
    fx: { version: 7, status: "fresh", ask_idr_per_usdt: "17635", is_manual_override: false },
    items: [{ sku: "visa:E33G:standard", entity_type: "VISA", entity_key: "E33G",
      option_code: "standard", label: { ru: "Стандарт", en: "Standard" },
      price_qualifier: "EXACT", amount_idr: "12000000", show_price: true,
      fee_verification_status: "VERIFIED", fee_note: { ru: null, en: null },
      display_usdt: "680.46", display_usd_approx: "680", sort_order: 0 }],
  };
}

test("Mini App/web price uses canonical approximate dollars without local calculation", () => {
  const value = projection();
  for (const locale of ["ru", "en"] as const) {
    assert.match(compactPriceLabel(value, "VISA", "E33G", locale)!, /IDR · ≈ \$680$/);
    value.items[0].display_usd_approx = "685";
    assert.match(compactPriceLabel(value, "VISA", "E33G", locale)!, /≈ \$685$/);
    value.items[0].display_usd_approx = "680";
  }
  assert.equal(value.items[0].display_usdt, "680.46");
});

test("expired or old-server projection never invents approximate dollars", () => {
  const value = projection();
  value.derived_expires_at = "2020-01-01T00:00:00Z";
  assert.doesNotMatch(compactPriceLabel(value, "VISA", "E33G", "ru")!, /≈|\$/);
  value.derived_expires_at = "2099-01-01T00:00:00Z";
  delete value.items[0].display_usd_approx;
  assert.doesNotMatch(compactPriceLabel(value, "VISA", "E33G", "ru")!, /≈|\$/);
  assert.match(compactPriceLabel(value, "VISA", "E33G", "ru")!, /IDR$/);
});
