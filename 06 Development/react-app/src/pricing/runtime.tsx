import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { appApiClient } from "../api/client";
import type { LocaleCode } from "../i18n/locale";

export type PricingItem = {
  sku: string;
  entity_type: "VISA" | "SERVICE";
  entity_key: string;
  option_code: string;
  label: { ru: string; en: string };
  price_qualifier: "EXACT" | "FROM" | "VARIABLE" | "CONTACT";
  amount_idr: string | null;
  show_price: boolean;
  fee_verification_status: "VERIFIED" | "NEEDS_VERIFICATION";
  fee_note: { ru: string | null; en: string | null };
  display_usdt: string | null;
  sort_order: number;
};

export type PricingProjection = {
  projection_id: string;
  publication_version: number;
  catalog_version_id: number;
  catalog_version: number;
  fx_snapshot_id: number;
  formula_version: string;
  accepted_at: string;
  derived_expires_at: string;
  max_refresh_lag_seconds: number;
  currency: "IDR";
  fx: {
    version: number;
    status: "fresh" | "stale" | "unavailable";
    ask_idr_per_usdt: string | null;
    is_manual_override: boolean;
  };
  items: PricingItem[];
};

type PricingRuntime = {
  projection: PricingProjection | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const PricingContext = createContext<PricingRuntime>({
  projection: null,
  loading: true,
  refresh: async () => undefined,
});

function withoutExpiredDerived(
  projection: PricingProjection,
  now = Date.now(),
): PricingProjection {
  const expiry = Date.parse(projection.derived_expires_at);
  if (Number.isFinite(expiry) && now <= expiry) return projection;
  return {
    ...projection,
    fx: { ...projection.fx, status: "unavailable", ask_idr_per_usdt: null },
    items: projection.items.map((item) => ({ ...item, display_usdt: null })),
  };
}

export function PricingProvider({ children }: { children: ReactNode }) {
  const [projection, setProjection] = useState<PricingProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const next = await appApiClient().request<PricingProjection>(
        "/api/catalog/pricing",
        { headers: { "Cache-Control": "no-cache" } },
      );
      if (
        typeof next.projection_id !== "string" ||
        !Number.isInteger(next.catalog_version_id) ||
        !Number.isInteger(next.fx_snapshot_id) ||
        !Array.isArray(next.items)
      ) {
        throw new Error("Invalid pricing projection");
      }
      setProjection(next);
      setClock(Date.now());
    } catch {
      setClock(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!projection) return;
    const expiry = Date.parse(projection.derived_expires_at);
    if (!Number.isFinite(expiry)) return;
    const timeout = window.setTimeout(
      () => setClock(Date.now()),
      Math.max(0, Math.min(expiry - Date.now() + 25, 2_147_000_000)),
    );
    return () => window.clearTimeout(timeout);
  }, [projection]);

  const safeProjection = useMemo(
    () => (projection ? withoutExpiredDerived(projection, clock) : null),
    [clock, projection],
  );

  return (
    <PricingContext.Provider value={{ projection: safeProjection, loading, refresh }}>
      {children}
    </PricingContext.Provider>
  );
}

export function usePricing() {
  return useContext(PricingContext);
}

export function pricingItems(
  projection: PricingProjection | null,
  entityType: PricingItem["entity_type"],
  entityKey: string,
) {
  return (projection?.items ?? [])
    .filter((item) => item.entity_type === entityType && item.entity_key === entityKey)
    .sort((a, b) => a.sort_order - b.sort_order || a.sku.localeCompare(b.sku));
}

export function compactPriceLabel(
  projection: PricingProjection | null,
  entityType: PricingItem["entity_type"],
  entityKey: string,
  locale: LocaleCode,
) {
  const items = pricingItems(projection, entityType, entityKey);
  const visible = items.filter((item) => item.show_price && item.amount_idr);
  if (!visible.length) {
    return items.some((item) => item.price_qualifier === "CONTACT")
      ? locale === "ru" ? "Цена по запросу" : "Price on request"
      : null;
  }
  const lowest = visible.reduce((left, right) =>
    BigInt(left.amount_idr!) <= BigInt(right.amount_idr!) ? left : right,
  );
  const amount = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    Number(lowest.amount_idr),
  );
  const prefix = visible.length > 1 || lowest.price_qualifier === "FROM"
    ? locale === "ru" ? "от " : "from "
    : "";
  const usdt = lowest.display_usdt ? ` · ≈ ${lowest.display_usdt} USDT` : "";
  return `${prefix}${amount} IDR${usdt}`;
}

export const visaEntityKeyByCatalogId: Record<string, string> = {
  e33g: "E33G",
  d12: "D12",
  "d1-d2": "D1/D2",
  c1: "C1",
  voa: "VOA",
};
