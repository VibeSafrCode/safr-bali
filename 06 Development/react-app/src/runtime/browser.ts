import type { RuntimeAdapter } from "./types";

const ACCOUNT_RETURN_PATH_PATTERN = /^\/account\/(?:[A-Za-z0-9_-]+\/)*$/;
const ADMIN_RETURN_PATH_PATTERN = /^\/admin\/(?:[A-Za-z0-9_-]+\/)*$/;

export function safeBrowserAccountPath(pathname: string) {
  return ACCOUNT_RETURN_PATH_PATTERN.test(pathname) ? pathname : "/account/";
}

export function browserLoginUrl(
  origin?: string,
  pathname?: string,
) {
  const currentOrigin =
    origin ??
    (typeof window === "undefined"
      ? "https://app.safrway.online"
      : window.location.origin);
  const currentPath =
    pathname ??
    (typeof window === "undefined" ? "/account/" : window.location.pathname);
  const url = new URL("/api/web/auth/start", currentOrigin);
  url.searchParams.set("return_to", safeBrowserAccountPath(currentPath));
  return url.toString();
}

export function adminLoginUrl(origin?: string, pathname?: string) {
  const currentOrigin = origin ?? window.location.origin;
  const candidate = pathname ?? window.location.pathname;
  const returnTo = ADMIN_RETURN_PATH_PATTERN.test(candidate) ? candidate : "/admin/";
  const url = new URL("/api/web/auth/start", currentOrigin);
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

export const browserRuntime: RuntimeAdapter = {
  kind: "browser",
  async initialize() {
    document.documentElement.dataset.runtime = "browser";
  },
  impact() {},
  openTelegram(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },
};
