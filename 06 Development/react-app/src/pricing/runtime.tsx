import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { appApiClient } from "../api/client";
import type { LocaleCode } from "../i18n/locale";
import { YOGA_MINI_APP, yogaReadDeadline } from "../runtime/yoga-mini-app";

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
  display_usd_approx?: string | null;
  sort_order: number;
};

export type PricingProjection = {
  projection_id: string;
  publication_version: number;
  catalog_version_id: number;
  catalog_version: number;
  fx_snapshot_id: number;
  formula_version: string;
  display_usd_approx_formula_version?: string;
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
  subscribe: () => () => void;
};

const noSubscription = () => () => {};
const PricingContext = createContext<PricingRuntime>({
  projection: null,
  loading: true,
  refresh: async () => undefined,
  subscribe: noSubscription,
});

export function withoutExpiredDerived(
  projection: PricingProjection,
  now = Date.now(),
): PricingProjection {
  const expiry = Date.parse(projection.derived_expires_at);
  if (Number.isFinite(expiry) && now <= expiry) return projection;
  return {
    ...projection,
    fx: { ...projection.fx, status: "unavailable", ask_idr_per_usdt: null },
    items: projection.items.map((item) => ({ ...item, display_usdt: null, display_usd_approx: null })),
  };
}

export function PricingProvider({ children }: { children: ReactNode }) {
  const [projection, setProjection] = useState<PricingProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(Date.now());
  const [demand, setDemand] = useState(0);
  const demandRef = useRef(demand);
  demandRef.current = demand;
  const inFlight = useRef<Promise<void> | null>(null);
  const subscribe = useCallback(() => {
    setDemand((current) => current + 1);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      setDemand((current) => Math.max(0, current - 1));
    };
  }, []);

  const refresh = useCallback((): Promise<void> => {
    if (YOGA_MINI_APP && demandRef.current === 0) return Promise.resolve();
    if (YOGA_MINI_APP && inFlight.current) return inFlight.current;
    const request = (async () => {
    try {
      if (YOGA_MINI_APP) setLoading(true);
      const api = appApiClient();
      const next = YOGA_MINI_APP
        ? await yogaReadDeadline((signal) => api.request<PricingProjection>(
          "/api/catalog/pricing", { headers: { "Cache-Control": "no-cache" }, signal },
        ))
        : await api.request<PricingProjection>(
          "/api/catalog/pricing", { headers: { "Cache-Control": "no-cache" } },
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
    })();
    if (YOGA_MINI_APP) {
      inFlight.current = request;
      void request.finally(() => { if (inFlight.current === request) inFlight.current = null; });
    }
    return request;
  }, []);

  const active = !YOGA_MINI_APP || demand > 0;
  useEffect(() => {
    if (!active) return;
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
  }, [active, refresh]);

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
    <PricingContext.Provider value={{ projection: safeProjection, loading, refresh, subscribe }}>
      {children}
    </PricingContext.Provider>
  );
}

export function usePricing(enabled = true) {
  const runtime = useContext(PricingContext);
  useEffect(() => {
    if (!YOGA_MINI_APP || !enabled) return;
    return runtime.subscribe();
  }, [enabled, runtime.subscribe]);
  return runtime;
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
  labels?: Readonly<{ contact: string; from: string }>,
) {
  const items = pricingItems(projection, entityType, entityKey);
  const visible = items.filter((item) => item.show_price && item.amount_idr);
  if (!visible.length) {
    return items.some((item) => item.price_qualifier === "CONTACT")
      ? labels?.contact ?? (locale === "ru" ? "Цена по запросу" : "Price on request")
      : null;
  }
  const lowest = visible.reduce((left, right) =>
    BigInt(left.amount_idr!) <= BigInt(right.amount_idr!) ? left : right,
  );
  const amount = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    Number(lowest.amount_idr),
  );
  const prefix = visible.length > 1 || lowest.price_qualifier === "FROM"
    ? labels?.from ?? (locale === "ru" ? "от " : "from ")
    : "";
  const expiry = Date.parse(projection!.derived_expires_at);
  const usd = Number.isFinite(expiry) && Date.now() <= expiry && lowest.display_usd_approx != null
    ? ` · ≈ $${lowest.display_usd_approx}` : "";
  return `${prefix}${amount} IDR${usd}`;
}

export const visaEntityKeyByCatalogId: Record<string, string> = {
  e33g: "E33G",
  d12: "D12",
  "d1-d2": "D1/D2",
  c1: "C1",
  voa: "VOA",
};
