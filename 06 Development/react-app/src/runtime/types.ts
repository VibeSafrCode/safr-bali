export type TelegramSafeAreaInset = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TelegramWebAppEvent =
  | "viewportChanged"
  | "safeAreaChanged"
  | "contentSafeAreaChanged"
  | "themeChanged";

export type TelegramWebApp = {
  initData: string;
  colorScheme?: "light" | "dark";
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramSafeAreaInset;
  contentSafeAreaInset?: TelegramSafeAreaInset;
  ready: () => void;
  expand: () => void;
  onEvent?: (
    eventType: TelegramWebAppEvent,
    eventHandler: (...args: unknown[]) => void,
  ) => void;
  offEvent?: (
    eventType: TelegramWebAppEvent,
    eventHandler: (...args: unknown[]) => void,
  ) => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium") => void;
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export type RuntimeAdapter = {
  kind: "telegram" | "browser";
  initialize: () => Promise<void>;
  impact: (style?: "light" | "medium") => void;
  openTelegram: (url: string) => void;
};
