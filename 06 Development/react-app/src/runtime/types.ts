export type TelegramWebApp = {
  initData: string;
  colorScheme?: "light" | "dark";
  ready: () => void;
  expand: () => void;
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
