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
import { createRefreshLoop } from "../../../shared/runtime/refresh-loop";

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
  retain: () => () => void;
};

const PricingContext = createContext<PricingRuntime>({
  projection: null,
  loading: true,
  refresh: async () => undefined,
  retain: () => () => undefined,
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
  const [consumers, setConsumers] = useState(0);
  const loop = useRef<ReturnType<typeof createRefreshLoop<PricingProjection>> | null>(null);
  const retain = useCallback(() => {
    setConsumers(count => count + 1);
    return () => setConsumers(count => Math.max(0, count - 1));
  }, []);
  const refresh = useCallback(() => loop.current?.refresh() ?? Promise.resolve(), []);
  const enabled = consumers > 0;
  useEffect(() => {
    if (!enabled) return;
    const poller = createRefreshLoop<PricingProjection>({
      async load(signal) {
      const next = await appApiClient().request<PricingProjection>(
        "/api/catalog/pricing",
        { signal, headers: { "Cache-Control": "no-cache" } },
      );
      if (
        typeof next.projection_id !== "string" ||
        !Number.isInteger(next.catalog_version_id) ||
        !Number.isInteger(next.fx_snapshot_id) ||
        typeof next.derived_expires_at !== "string" ||
        !Array.isArray(next.items)
      ) {
        throw new Error("Invalid pricing projection");
      }
      return next;
      },
      onValue(next) {
      setProjection(next);
      setClock(Date.now());
      },
      onWake: () => setClock(Date.now()),
      onSettled: () => { setClock(Date.now()); setLoading(false); },
    });
    loop.current = poller;
    poller.start();
    return () => {
      poller.stop();
      loop.current = null;
    };
  }, [enabled]);

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
    <PricingContext.Provider value={{ projection: safeProjection, loading, refresh, retain }}>
      {children}
    </PricingContext.Provider>
  );
}

export function usePricing(enabled = true) {
  const context = useContext(PricingContext);
  useEffect(() => enabled ? context.retain() : undefined, [context.retain, enabled]);
  return context;
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
