import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { ExchangeCurrencyOption } from "../api/types";
import { useI18n, type MiniAppTranslationKey } from "../i18n/runtime";
import "./exchange-asset-dialog.css";

const ASSET_LABEL_KEYS: Record<string, MiniAppTranslationKey> = {
  USDT: "calculator.asset.usdt",
  IDR_CASH: "calculator.asset.idrCash",
  IDR_BANK: "calculator.asset.idrBank",
  RUB_BANK: "calculator.asset.rubBank",
};

type ExchangeAssetWheelProps = {
  label: string;
  value: string;
  options: ExchangeCurrencyOption[];
  onChange: (value: string) => void;
  onHaptic?: () => void;
};

export function ExchangeAssetWheel({
  label,
  value,
  options,
  onChange,
  onHaptic,
}: ExchangeAssetWheelProps) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selected = options.find((option) => option.code === value) ?? null;
  const assetLabel = (option: ExchangeCurrencyOption) => {
    const key = ASSET_LABEL_KEYS[option.code];
    if (key) return t(key);
    return locale === "en" ? option.code : option.label;
  };
  const optionIds = useMemo(
    () => options.map((option) => `${listboxId}-${option.code}`),
    [listboxId, options],
  );

  function revealOption(option: HTMLButtonElement | null) {
    const list = listRef.current;
    if (!list || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const overflow = document.documentElement.style.overflow;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    const position = () => {
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      dialog.style.setProperty("--asset-viewport-top", `${viewportTop}px`);
      dialog.style.setProperty("--asset-viewport-height", `${viewportHeight}px`);
      const anchor = triggerRef.current?.getBoundingClientRect();
      const sheet = dialog.querySelector<HTMLElement>(".asset-sheet");
      if (!anchor || !sheet) return;
      const width = Math.min(360, window.innerWidth - 32);
      const left = Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16));
      const below = anchor.bottom - viewportTop + 8;
      const top = below + sheet.offsetHeight <= viewportHeight - 16
        ? below : Math.max(16, anchor.top - viewportTop - sheet.offsetHeight - 8);
      dialog.style.setProperty("--asset-left", `${left}px`);
      dialog.style.setProperty("--asset-top", `${top}px`);
    };
    position();
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    const modalBack = (event: Event) => { event.preventDefault(); close(); };
    window.addEventListener("safr:modal-back", modalBack);
    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) return;
      const option = list.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      (option ?? list).focus({ preventScroll: true });
      revealOption(option);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
      window.removeEventListener("safr:modal-back", modalBack);
      dialog.close();
      document.documentElement.style.overflow = overflow;
    };
    // Opening focuses the current choice without changing it or scrolling the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }

  function choose(nextValue: string, closeAfter = false) {
    if (nextValue !== value) {
      onChange(nextValue);
      onHaptic?.();
    }
    if (closeAfter) close();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = buttons[Math.min(buttons.length - 1, Math.max(0, currentIndex + (event.key === "ArrowDown" ? 1 : -1)))];
      next?.focus({ preventScroll: true });
      revealOption(next ?? null);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : options.length - 1;
      buttons[nextIndex]?.focus({ preventScroll: true });
      revealOption(buttons[nextIndex] ?? null);
    }
  }

  return (
    <div className="asset-picker">
      <span className="asset-picker-label">{label}</span>
      <button
        ref={triggerRef}
        className="asset-picker-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onKeyDown={onTriggerKeyDown}
      >
        <span>
          <strong>{selected ? assetLabel(selected) : t("calculator.asset.select")}</strong>
        </span>
        <i aria-hidden="true">⌄</i>
      </button>

      <select
        className="asset-select-fallback"
        aria-label={label}
        value={value}
        onChange={(event) => choose(event.target.value)}
      >
        {!value && <option value="">{t("calculator.asset.select")}</option>}
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {assetLabel(option)}
          </option>
        ))}
      </select>

      {open && (
        <dialog
          ref={dialogRef}
          className="asset-sheet-backdrop exchange-asset-dialog"
          aria-labelledby={titleId}
          onCancel={(event) => { event.preventDefault(); close(); }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className="asset-sheet"
            aria-labelledby={titleId}
          >
            <header>
              <div>
                <span className="eyebrow">{t("calculator.asset.sheetEyebrow")}</span>
                <h2 id={titleId}>{label}</h2>
              </div>
              <button type="button" aria-label={t("calculator.asset.closeAria")} onClick={close}>
                ×
              </button>
            </header>
            <div className="asset-wheel-frame">
              <div
                ref={listRef}
                className="asset-wheel"
                id={listboxId}
                role="listbox"
                aria-label={label}
                tabIndex={0}
                onKeyDown={onListKeyDown}
              >
                {options.map((option, index) => (
                  <button
                    className={option.code === value ? "selected" : ""}
                    id={optionIds[index]}
                    key={option.code}
                    type="button"
                    role="option"
                    aria-selected={option.code === value}
                    tabIndex={0}
                    onClick={() => choose(option.code, true)}
                  >
                    <strong>{assetLabel(option)}</strong>
                    <span aria-hidden="true">{option.code === value ? "✓" : ""}</span>
                  </button>
                ))}
              </div>
            </div>
            <button className="button primary" type="button" onClick={close}>
              {t("calculator.asset.done")}
            </button>
          </section>
        </dialog>
      )}
    </div>
  );
}
