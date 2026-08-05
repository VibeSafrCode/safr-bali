import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type {
  TelegramSafeAreaInset,
  TelegramWebApp,
  TelegramWebAppEvent,
} from "../runtime/types";

const ZERO_INSET: TelegramSafeAreaInset = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export type TelegramLayout = {
  safeArea: TelegramSafeAreaInset;
  contentSafeArea: TelegramSafeAreaInset;
  viewportHeight: number | null;
};

export function readTelegramLayout(
  webApp: TelegramWebApp | null,
): TelegramLayout {
  return {
    safeArea: webApp?.safeAreaInset ?? ZERO_INSET,
    contentSafeArea: webApp?.contentSafeAreaInset ?? ZERO_INSET,
    viewportHeight:
      webApp?.viewportStableHeight ?? webApp?.viewportHeight ?? null,
  };
}

function layoutStyle(layout: TelegramLayout): CSSProperties {
  return {
    "--safr-tg-safe-top": `${layout.safeArea.top}px`,
    "--safr-tg-safe-right": `${layout.safeArea.right}px`,
    "--safr-tg-safe-bottom": `${layout.safeArea.bottom}px`,
    "--safr-tg-safe-left": `${layout.safeArea.left}px`,
    "--safr-tg-content-top": `${layout.contentSafeArea.top}px`,
    "--safr-tg-content-right": `${layout.contentSafeArea.right}px`,
    "--safr-tg-content-bottom": `${layout.contentSafeArea.bottom}px`,
    "--safr-tg-content-left": `${layout.contentSafeArea.left}px`,
    "--safr-tg-viewport-height": layout.viewportHeight
      ? `${layout.viewportHeight}px`
      : "100dvh",
  } as CSSProperties;
}

export function TelegramSafeArea({
  webApp,
  children,
}: {
  webApp: TelegramWebApp | null;
  children: ReactNode;
}) {
  const [layout, setLayout] = useState(() => readTelegramLayout(webApp));

  useEffect(() => {
    const update = () => setLayout(readTelegramLayout(webApp));
    const events: TelegramWebAppEvent[] = [
      "viewportChanged",
      "safeAreaChanged",
      "contentSafeAreaChanged",
    ];

    update();
    for (const event of events) webApp?.onEvent?.(event, update);
    window.addEventListener("resize", update);
    return () => {
      for (const event of events) webApp?.offEvent?.(event, update);
      window.removeEventListener("resize", update);
    };
  }, [webApp]);

  return (
    <div className="telegram-safe-area" style={layoutStyle(layout)}>
      {children}
    </div>
  );
}
