import type { Dashboard } from "../api/types";

// Build-time selection only. A URL/query/Telegram start parameter is not authority.
export const YOGA_MINI_APP =
  typeof __YOGA_MINI_APP__ !== "undefined" && __YOGA_MINI_APP__ === true;
export const YOGA_MINI_APP_BASE = "/yoga-preview/mini-app/";
export const YOGA_BOT_URL = "https://t.me/Yoga_ganster_bot";

export function miniAppRequestPath(path: string, yoga = YOGA_MINI_APP): string {
  if (!yoga) return path;
  if (path === "/api/catalog/pricing") return `${YOGA_MINI_APP_BASE}api/catalog/pricing`;
  if (path.split("?", 1)[0] === "/mini-app/auth/session") {
    throw new Error("Main Telegram authentication is unavailable in Yoga");
  }
  if (!/^\/mini-app\/[a-z0-9_/-]+(?:\?[a-zA-Z0-9%_.~=&+-]*)?$/.test(path)
      || path.includes("..") || path.includes("//")) {
    throw new Error("Unsupported Yoga Mini App request");
  }
  return `${YOGA_MINI_APP_BASE}api${path}`;
}

export function miniAppAssetPath(path: string, yoga = YOGA_MINI_APP): string {
  if (!yoga) return path;
  // The reviewed guide stays in the existing public Yoga site, not a copied store.
  if (path.startsWith("/downloads/")) return `/yoga-preview${path}`;
  return path.startsWith("/assets/") ? `${YOGA_MINI_APP_BASE}${path.slice(1)}` : path;
}

export function miniAppSrcSet(value: string | undefined): string | undefined {
  return value?.split(",").map((item) => {
    const [path, ...descriptor] = item.trim().split(/\s+/);
    return [miniAppAssetPath(path), ...descriptor].join(" ");
  }).join(", ");
}

export function miniAppDocumentPath(path: string, yoga = YOGA_MINI_APP): string {
  return yoga && path.startsWith("/mini-app/") ? miniAppRequestPath(path, yoga) : path;
}

export function yogaDashboard(result: Dashboard): Dashboard {
  // This ID is accepted only from the authenticated backend, never initDataUnsafe.
  if (!Number.isSafeInteger(result.telegram_id) || result.telegram_id <= 0) {
    throw new Error("Verified Mini App actor is missing");
  }
  const payload = (result as Dashboard & { referral_payload?: unknown }).referral_payload;
  if (payload === null) return { ...result, referral_link: null };
  if (typeof payload !== "string" || !/^r_[2-9A-HJ-NP-Z]{8}$/.test(payload)) {
    throw new Error("Verified opaque referral code is missing");
  }
  return { ...result, referral_link: `${YOGA_BOT_URL}?start=${payload}` };
}

type MiniApi = { request<T>(path: string, options?: RequestInit): Promise<T> };

export async function authenticateYogaMiniApp(
  api: MiniApi, initData: string, signal?: AbortSignal,
): Promise<Dashboard | null> {
  if (!initData.trim()) return null;
  // Always verify this launch's Yoga signature before reading any cached session.
  await api.request("/mini-app/auth/yoga-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ init_data: initData }), signal,
  });
  return yogaDashboard(await api.request<Dashboard>("/mini-app/yoga-account", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal,
  }));
}

export function yogaLaunchAuthentication() {
  let launch: { initData: string; promise: Promise<Dashboard | null> } | null = null;
  return (api: MiniApi, initData: string): Promise<Dashboard | null> => {
    if (!launch || launch.initData !== initData) {
      // Never bind a server-side signature exchange to a disposable React effect.
      launch = { initData, promise: authenticateYogaMiniApp(api, initData) };
    }
    return launch.promise;
  };
}
