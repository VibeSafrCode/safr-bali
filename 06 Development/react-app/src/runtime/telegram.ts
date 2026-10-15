import type { RuntimeAdapter, TelegramWebApp } from "./types";
import { YOGA_MINI_APP } from "./yoga-mini-app";

const SDK_URL = "https://telegram.org/js/telegram-web-app.js?63";
const SDK_SELECTOR = 'script[data-safr-telegram-sdk="true"]';

type YogaTelegramSdkState = {
  status: "loading" | "ready" | "error" | "timeout";
  promise: Promise<TelegramWebApp | null>;
};

declare global {
  interface Window {
    __yogaTelegramSdk?: YogaTelegramSdkState;
  }
}

export function loadYogaTelegramWebApp(): Promise<TelegramWebApp | null> {
  // The deferred Yoga bootstrap starts one absolute five-second deadline before
  // this module runs. Retain early errors/timeouts instead of waiting again or
  // accepting a late SDK after the failed launch. A new launch requires reload.
  return window.__yogaTelegramSdk?.promise ?? Promise.resolve(null);
}

export async function loadTelegramWebApp(timeoutMs = 5000) {
  if (YOGA_MINI_APP) return loadYogaTelegramWebApp();
  if (window.Telegram?.WebApp) return window.Telegram.WebApp;

  return new Promise<TelegramWebApp | null>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(window.Telegram?.WebApp ?? null);
    };
    const existing = document.querySelector<HTMLScriptElement>(SDK_SELECTOR);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", finish, { once: true });
    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      script.dataset.safrTelegramSdk = "true";
      document.head.append(script);
    }
    const timer = window.setTimeout(finish, timeoutMs);
  });
}

export function telegramInitData(webApp: TelegramWebApp | null) {
  // Identity is never read from initDataUnsafe. The opaque signed value is
  // exchanged for an HttpOnly server session by FastAPI.
  return webApp?.initData?.trim() ?? "";
}

export function createTelegramRuntime(
  getWebApp: () => TelegramWebApp | null,
): RuntimeAdapter {
  return {
    kind: "telegram",
    async initialize() {
      const webApp = getWebApp();
      if (!webApp) return;
      webApp.ready();
      webApp.expand();
      document.documentElement.dataset.telegramTheme =
        webApp.colorScheme ?? "light";
    },
    impact(style = "light") {
      getWebApp()?.HapticFeedback?.impactOccurred(style);
    },
    openTelegram(url) {
      const webApp = getWebApp();
      if (webApp?.openTelegramLink) {
        webApp.openTelegramLink(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    },
  };
}
