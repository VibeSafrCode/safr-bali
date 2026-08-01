import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { ExchangeCurrencyOption } from "../api/types";

const WHEEL_ROW_HEIGHT = 52;

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
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.code === value),
  );
  const selected = options.find((option) => option.code === value) ?? null;
  const optionIds = useMemo(
    () => options.map((option) => `${listboxId}-${option.code}`),
    [listboxId, options],
  );

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) return;
      list.scrollTop = selectedIndex * WHEEL_ROW_HEIGHT;
      list.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
    // Position only when the sheet opens. User scrolling owns the position after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(
    () => () => {
      if (scrollFrame.current !== null) {
        window.cancelAnimationFrame(scrollFrame.current);
      }
    },
    [],
  );

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function choose(nextValue: string, closeAfter = false) {
    if (nextValue !== value) {
      onChange(nextValue);
      onHaptic?.();
    }
    if (closeAfter) close();
  }

  function moveSelection(offset: number, closeAfter = false) {
    if (!options.length) return;
    const currentIndex = Math.max(
      0,
      options.findIndex((option) => option.code === value),
    );
    const nextIndex = Math.min(
      options.length - 1,
      Math.max(0, currentIndex + offset),
    );
    choose(options[nextIndex].code, closeAfter);
    listRef.current?.scrollTo({
      top: nextIndex * WHEEL_ROW_HEIGHT,
      behavior: "smooth",
    });
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : options.length - 1;
      choose(options[nextIndex].code);
      listRef.current?.scrollTo({
        top: nextIndex * WHEEL_ROW_HEIGHT,
        behavior: "smooth",
      });
    }
  }

  function onWheelScroll() {
    if (scrollFrame.current !== null) {
      window.cancelAnimationFrame(scrollFrame.current);
    }
    scrollFrame.current = window.requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list || !options.length) return;
      const nextIndex = Math.min(
        options.length - 1,
        Math.max(0, Math.round(list.scrollTop / WHEEL_ROW_HEIGHT)),
      );
      choose(options[nextIndex].code);
    });
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
          <strong>{selected?.label ?? "Выберите валюту"}</strong>
          <small>{selected?.code ?? "—"}</small>
        </span>
        <i aria-hidden="true">⌄</i>
      </button>

      <select
        className="asset-select-fallback"
        aria-label={label}
        value={value}
        onChange={(event) => choose(event.target.value)}
      >
        {!value && <option value="">Выберите валюту</option>}
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>

      {open && (
        <div
          className="asset-sheet-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className="asset-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header>
              <div>
                <span className="eyebrow">Обмен валюты</span>
                <h2 id={titleId}>{label}</h2>
              </div>
              <button type="button" aria-label="Закрыть выбор" onClick={close}>
                ×
              </button>
            </header>
            <div className="asset-wheel-frame">
              <div className="asset-wheel-selection" aria-hidden="true" />
              <div
                ref={listRef}
                className="asset-wheel"
                id={listboxId}
                role="listbox"
                aria-label={label}
                aria-activedescendant={optionIds[selectedIndex]}
                tabIndex={0}
                onKeyDown={onListKeyDown}
                onScroll={onWheelScroll}
              >
                {options.map((option, index) => (
                  <button
                    className={option.code === value ? "selected" : ""}
                    id={optionIds[index]}
                    key={option.code}
                    type="button"
                    role="option"
                    aria-selected={option.code === value}
                    tabIndex={-1}
                    onClick={() => choose(option.code, true)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.code}</small>
                  </button>
                ))}
              </div>
            </div>
            <button className="button primary" type="button" onClick={close}>
              Готово
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
