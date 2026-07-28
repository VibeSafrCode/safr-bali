import type { RuntimeAdapter } from "./types";

const ACCOUNT_RETURN_PATH = "/account/";

export function browserLoginUrl(origin = window.location.origin) {
  const url = new URL("/api/web/auth/start", origin);
  url.searchParams.set("return_to", ACCOUNT_RETURN_PATH);
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
