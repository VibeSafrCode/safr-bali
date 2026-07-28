export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export type TelegramWebApp = {
  initData: string;
  colorScheme?: "light" | "dark";
  ready: () => void;
  expand: () => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback?: { impactOccurred: (style: "light" | "medium") => void };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SDK_URL = "https://telegram.org/js/telegram-web-app.js";
const SDK_SELECTOR = 'script[data-safr-telegram-sdk="true"]';

export function initializeTelegramWebApp(webApp: TelegramWebApp) {
  webApp.ready();
  webApp.expand();
  if (typeof document !== "undefined") {
    document.documentElement.dataset.telegramTheme =
      webApp.colorScheme ?? "light";
  }
  return webApp;
}

export async function loadTelegramWebApp(timeoutMs = 5000) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  if (window.Telegram?.WebApp) {
    return initializeTelegramWebApp(window.Telegram.WebApp);
  }

  return new Promise<TelegramWebApp | null>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      const webApp = window.Telegram?.WebApp;
      resolve(webApp ? initializeTelegramWebApp(webApp) : null);
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
