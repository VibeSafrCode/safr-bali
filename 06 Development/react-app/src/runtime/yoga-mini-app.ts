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
  if (path === "/downloads/all-indonesia-client-guide-safrway-2026.pdf" ||
      path === "https://safrway.online/downloads/all-indonesia-client-guide-safrway-2026.pdf") {
    return "/yoga-preview/downloads/all-indonesia-client-guide-yoga-2026.pdf";
  }
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

export class YogaReadTimeoutError extends Error {
  constructor() { super("Yoga read deadline exceeded"); this.name = "YogaReadTimeoutError"; }
}

// Explicit read consumers only. In particular, never wrap or automatically retry
// the signed authentication POST. A timed-out account read may have created its
// existing opaque alias server-side; this deadline is not a rollback.
export function yogaReadDeadline<T>(
  read: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, timeoutMs = 20_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (result: { value: T } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancelled);
      if ("error" in result) { controller.abort(); reject(result.error); } else resolve(result.value);
    };
    const cancelled = () => {
      finish({ error: new DOMException("Yoga view was disposed", "AbortError") });
      controller.abort();
    };
    const timer = setTimeout(() => {
      finish({ error: new YogaReadTimeoutError() });
      controller.abort();
    }, timeoutMs);
    if (signal?.aborted) { cancelled(); return; }
    signal?.addEventListener("abort", cancelled, { once: true });
    try { void read(controller.signal).then((value) => finish({ value }), (error) => finish({ error })); }
    catch (error) { finish({ error }); }
  });
}

export type YogaLaunch = {
  readonly viewInstanceKey: string;
  readonly verified: Promise<boolean>;
  readonly account: Promise<Dashboard | null>;
  readonly invalidated: boolean;
  retryAccount: () => Promise<Dashboard | null>;
  invalidate: () => void;
};

let viewSequence = 0;

function createYogaLaunch(api: MiniApi, initData: string, authSignal?: AbortSignal): YogaLaunch {
  const reads = new AbortController();
  let invalidated = false;
  let didVerify = false;
  let accountState: "pending" | "ready" | "error" = "pending";
  // Per-page React identity only: never an actor, initData, URL or stored value.
  const viewInstanceKey = `yoga-view-${++viewSequence}`;
  const verified = initData.trim() ? api.request("/mini-app/auth/yoga-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ init_data: initData }), signal: authSignal,
  }).then(() => { didVerify = true; return true; }) : Promise.resolve(false);
  const invalidate = () => { invalidated = true; reads.abort(); };

  const readAccount = () => yogaReadDeadline(async (signal) => yogaDashboard(
    await api.request<Dashboard>("/mini-app/yoga-account", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal,
    }),
  ), authSignal ?? reads.signal);

  const watchAccount = (promise: Promise<Dashboard | null>) => {
    void promise.then(() => { accountState = "ready"; }, (error: unknown) => {
      accountState = "error";
      const status = error && typeof error === "object" && "status" in error ? error.status : null;
      if (status === 401 || status === 403) invalidate();
    });
    return promise;
  };
  let account = watchAccount(verified.then((authenticated) => {
    if (!authenticated) return null;
    if (authSignal?.aborted || reads.signal.aborted) throw new DOMException("Yoga launch was disposed", "AbortError");
    return readAccount();
  }));
  return {
    viewInstanceKey, verified,
    get account() { return account; },
    get invalidated() { return invalidated; },
    invalidate,
    retryAccount() {
      // A user may retry this logical read after a transport/server failure.
      // Never reset a rejected signature exchange or a denied session.
      if (accountState === "error" && didVerify && !invalidated) {
        accountState = "pending";
        account = watchAccount(verified.then((authenticated) => authenticated ? readAccount() : null));
      }
      return account;
    },
  };
}

export function yogaLaunchSession() {
  let launch: { initData: string; value: YogaLaunch } | null = null;
  return (api: MiniApi, initData: string): YogaLaunch => {
    if (!launch || launch.initData !== initData) {
      launch?.value.invalidate();
      // Never bind a server-side signature exchange to a disposable React effect.
      launch = { initData, value: createYogaLaunch(api, initData) };
    }
    return launch.value;
  };
}

export function authenticateYogaMiniApp(
  api: MiniApi, initData: string, signal?: AbortSignal,
): Promise<Dashboard | null> {
  return createYogaLaunch(api, initData, signal).account;
}

export function yogaLaunchAuthentication() {
  const launch = yogaLaunchSession();
  return (api: MiniApi, initData: string): Promise<Dashboard | null> => {
    return launch(api, initData).account;
  };
}
