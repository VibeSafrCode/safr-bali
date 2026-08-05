import { useEffect, useMemo, useRef, useState } from "react";

import { apiErrorMessage, appApiClient } from "../api/client";
import { destinationById } from "../catalog";
import type {
  ExchangeOptions,
  ExchangePair,
  ExchangeQuote,
  ExchangeRequest,
  RouteContext,
} from "../api/types";
import { CurrencyRouteSelector } from "./CurrencyRouteSelector";
import { CountryHeader } from "./CountryHeader";

type CurrencyCalculatorProps = {
  navigate: (path: string) => void;
  onManager: (context: RouteContext) => void;
  onHaptic?: () => void;
};

type CalculationMode = "GIVE" | "RECEIVE";
type QuoteStatus = "idle" | "debouncing" | "loading" | "ready" | "error";
type RequestStatus = "idle" | "sending" | "sent" | "error";

const currencySymbols: Record<string, string> = {
  USDT: "USDT",
  IDR_CASH: "IDR",
  IDR_BANK: "IDR",
  RUB_BANK: "RUB",
};

function decimalInput(value: string) {
  return value.trim().replaceAll(" ", "").replace(",", ".");
}

function validAmount(value: string) {
  const normalized = decimalInput(value);
  return /^\d+(?:\.\d{0,8})?$/.test(normalized) && Number(normalized) > 0;
}

function routeCode(pair: ExchangePair) {
  return (
    pair.route_code ?? `${pair.give_currency}_TO_${pair.receive_currency}`
  );
}

function quoteId(quote: ExchangeQuote | null) {
  return quote?.quote_id ?? quote?.id ?? "";
}

function groupBackendDisplay(value: string) {
  const trimmed = value.trim();
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(trimmed);
  if (!match) return trimmed;
  const grouped = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${match[1]}${grouped}${match[3] ?? ""}`;
}

function legacyMoney(value: string | undefined, asset: string) {
  if (!value) return `— ${currencySymbols[asset] ?? asset}`;
  return `${groupBackendDisplay(value)} ${currencySymbols[asset] ?? asset}`;
}

function quoteDisplay(
  quote: ExchangeQuote,
  side: "source" | "target",
  fallbackAsset: string,
) {
  const modernAmount =
    side === "source"
      ? quote.source_amount_display
      : quote.target_amount_display;
  const asset =
    (side === "source" ? quote.source_asset : quote.target_asset) ??
    (side === "source" ? quote.give_currency : quote.receive_currency) ??
    fallbackAsset;
  if (modernAmount !== undefined) {
    return `${groupBackendDisplay(modernAmount)} ${currencySymbols[asset] ?? asset}`;
  }
  return legacyMoney(
    side === "source" ? quote.give_amount : quote.receive_amount,
    asset,
  );
}

function idempotencyKey(id: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `exchange-request-${id}-${suffix}`.slice(0, 100);
}

function quoteTime(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function CurrencyCalculator({
  navigate,
  onManager,
  onHaptic,
}: CurrencyCalculatorProps) {
  const bali = destinationById("bali");
  const api = useMemo(() => appApiClient(), []);
  const quoteVersion = useRef(0);
  const quoteCardRef = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<ExchangeOptions | null>(null);
  const [optionsStatus, setOptionsStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [giveCurrency, setGiveCurrency] = useState("");
  const [receiveCurrency, setReceiveCurrency] = useState("");
  const [mode, setMode] = useState<CalculationMode>("GIVE");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<ExchangeQuote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("idle");
  const [quoteError, setQuoteError] = useState("");
  const [request, setRequest] = useState<ExchangeRequest | null>(null);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("idle");
  const [requestError, setRequestError] = useState("");
  const [requestKey, setRequestKey] = useState("");

  const enabledPairs = useMemo(
    () =>
      (options?.supported_pairs ?? []).filter(
        (entry) =>
          entry.enabled !== false && entry.manual_calculation_required !== true,
      ),
    [options],
  );
  const giveOptions = useMemo(
    () =>
      (options?.give ?? []).filter((option) =>
        enabledPairs.some((pair) => pair.give_currency === option.code),
      ),
    [enabledPairs, options],
  );
  const receiveOptions = useMemo(
    () =>
      (options?.receive ?? []).filter((option) =>
        enabledPairs.some(
          (pair) =>
            pair.give_currency === giveCurrency &&
            pair.receive_currency === option.code &&
            option.code !== giveCurrency,
        ),
      ),
    [enabledPairs, giveCurrency, options],
  );
  const pair =
    enabledPairs.find(
      (entry) =>
        entry.give_currency === giveCurrency &&
        entry.receive_currency === receiveCurrency,
    ) ?? null;
  const reversePair = pair
    ? enabledPairs.find(
        (entry) =>
          entry.give_currency === pair.receive_currency &&
          entry.receive_currency === pair.give_currency,
      ) ?? null
    : null;
  const supportsGive = pair?.amount_sides.includes("give") ?? false;
  const supportsReceive = pair?.amount_sides.includes("receive") ?? false;

  useEffect(() => {
    const controller = new AbortController();
    async function loadOptions() {
      try {
        const result = await api.request<ExchangeOptions>(
          "/mini-app/exchange/options",
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setOptions(result);
        const firstPair = result.supported_pairs.find(
          (entry) =>
            entry.enabled !== false &&
            entry.manual_calculation_required !== true,
        );
        if (firstPair) {
          setGiveCurrency(firstPair.give_currency);
          setReceiveCurrency(firstPair.receive_currency);
        }
        setOptionsStatus("ready");
      } catch (caught) {
        if (!controller.signal.aborted) {
          setQuoteError(apiErrorMessage(caught));
          setOptionsStatus("error");
        }
      }
    }
    void loadOptions();
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    if (!pair) return;
    if (mode === "GIVE" && supportsGive) return;
    if (mode === "RECEIVE" && supportsReceive) return;
    setMode(supportsGive ? "GIVE" : "RECEIVE");
  }, [mode, pair, supportsGive, supportsReceive]);

  useEffect(() => {
    const version = ++quoteVersion.current;
    setRequest(null);
    setRequestStatus("idle");
    setRequestError("");
    setRequestKey("");

    if (!pair || !validAmount(amount)) {
      setQuote(null);
      setQuoteStatus("idle");
      setQuoteError("");
      return;
    }

    const controller = new AbortController();
    setQuoteStatus("debouncing");
    setQuoteError("");
    const timer = window.setTimeout(async () => {
      setQuoteStatus("loading");
      try {
        const result = await api.request<ExchangeQuote>(
          "/mini-app/exchange/quotes",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              route_code: routeCode(pair),
              mode,
              amount: decimalInput(amount),
              give_currency: pair.give_currency,
              receive_currency: pair.receive_currency,
              amount_side: mode.toLowerCase(),
            }),
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted || version !== quoteVersion.current) return;
        const resultId = quoteId(result);
        setQuote(result);
        setRequestKey(resultId ? idempotencyKey(resultId) : "");
        setQuoteStatus("ready");
      } catch (caught) {
        if (controller.signal.aborted || version !== quoteVersion.current) return;
        setQuote(null);
        setQuoteError(apiErrorMessage(caught));
        setQuoteStatus("error");
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [amount, api, mode, pair]);

  useEffect(() => {
    if (quoteStatus !== "ready" || !quote) return;
    const frame = window.requestAnimationFrame(() => {
      quoteCardRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [quote, quoteStatus]);

  function selectGive(value: string) {
    const nextPair = enabledPairs.find((entry) => entry.give_currency === value);
    setGiveCurrency(value);
    setReceiveCurrency((current) =>
      enabledPairs.some(
        (entry) =>
          entry.give_currency === value && entry.receive_currency === current,
      )
        ? current
        : (nextPair?.receive_currency ?? ""),
    );
  }

  function selectReceive(value: string) {
    setReceiveCurrency(value);
  }

  function selectMode(nextMode: CalculationMode) {
    if (mode === nextMode) return;
    setMode(nextMode);
    onHaptic?.();
  }

  function swapRoute() {
    if (!pair || !reversePair) return;
    setGiveCurrency(pair.receive_currency);
    setReceiveCurrency(pair.give_currency);
    onHaptic?.();
  }

  async function createRequest() {
    const id = quoteId(quote);
    if (!id || requestStatus === "sending" || requestStatus === "sent") return;
    const key = requestKey || idempotencyKey(id);
    setRequestKey(key);
    setRequestStatus("sending");
    setRequestError("");
    try {
      const result = await api.request<ExchangeRequest>(
        "/mini-app/exchange/requests",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({ quote_id: id }),
        },
      );
      setRequest(result);
      setRequestStatus("sent");
      onHaptic?.();
    } catch (caught) {
      setRequestError(apiErrorMessage(caught));
      setRequestStatus("error");
    }
  }

  function openManager() {
    onManager({
      country: "Бали",
      section: "Обмен валюты",
      service: pair
        ? `${pair.give_currency} → ${pair.receive_currency}`
        : "Калькулятор обмена",
    });
  }

  const countryHeader = bali ? (
    <CountryHeader
      destination={bali}
      context="Обмен валюты"
      backLabel="Услуги Бали"
      onBack={() => navigate("services/bali/exchange")}
    />
  ) : null;

  if (optionsStatus === "loading") {
    return (
      <section className="page-stack">
        {countryHeader}
        <header className="page-heading calculator-heading">
          <h1>Обмен валюты</h1>
          <p>Загружаем доступные направления…</p>
        </header>
        <div className="quote-skeleton" role="status" aria-label="Загрузка" />
      </section>
    );
  }

  if (optionsStatus === "error" || !options || !enabledPairs.length) {
    return (
      <section className="page-stack">
        {countryHeader}
        <header className="page-heading calculator-heading">
          <h1>Калькулятор временно недоступен</h1>
          <p>{quoteError || "Нет доступных направлений для автоматического расчёта."}</p>
        </header>
        <button className="button secondary" type="button" onClick={openManager}>
          Написать менеджеру
        </button>
      </section>
    );
  }

  const currentRouteCode = pair ? routeCode(pair) : "";
  const amountAsset = mode === "GIVE" ? giveCurrency : receiveCurrency;

  return (
    <section className="page-stack calculator-page">
      {countryHeader}
      <header className="page-heading calculator-heading">
        <h1>Обмен валюты</h1>
        <p>Предварительный расчёт по доступным направлениям.</p>
      </header>

      <CurrencyRouteSelector
        giveCurrency={giveCurrency}
        giveOptions={giveOptions}
        receiveCurrency={receiveCurrency}
        receiveOptions={receiveOptions}
        canSwap={Boolean(reversePair)}
        onGiveChange={selectGive}
        onReceiveChange={selectReceive}
        onSwap={swapRoute}
        onHaptic={onHaptic}
      />

      <div className="calculator-card calculator-inputs">
        <fieldset className="currency-choice">
          <legend>Режим расчёта</legend>
          <div className="choice-grid mode-choice">
            <button
              className={mode === "GIVE" ? "selected" : ""}
              type="button"
              aria-pressed={mode === "GIVE"}
              disabled={!supportsGive}
              onClick={() => selectMode("GIVE")}
            >
              Сколько отдаю
            </button>
            <button
              className={mode === "RECEIVE" ? "selected" : ""}
              type="button"
              aria-pressed={mode === "RECEIVE"}
              disabled={!supportsReceive}
              onClick={() => selectMode("RECEIVE")}
            >
              Сколько хочу получить
            </button>
          </div>
        </fieldset>
        <label className="amount-field">
          <span>Сумма</span>
          <span className="amount-control">
            <input
              aria-label={
                mode === "GIVE" ? "Сколько отдаёте" : "Сколько хотите получить"
              }
              autoComplete="off"
              inputMode="decimal"
              placeholder={mode === "GIVE" ? "Например, 100" : "Например, 200 000"}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <b aria-hidden="true">{currencySymbols[amountAsset] ?? amountAsset}</b>
          </span>
        </label>
        <small className="live-quote-hint">Расчёт обновится автоматически.</small>
      </div>

      {quoteStatus === "idle" && (
        <div className="quote-empty" role="status">
          <strong>Введите сумму</strong>
          <p>Предварительный результат появится автоматически.</p>
        </div>
      )}

      {(quoteStatus === "debouncing" || quoteStatus === "loading") && !quote && (
        <div className="quote-skeleton" role="status" aria-live="polite">
          <span>Обновляем предварительный расчёт…</span>
        </div>
      )}

      {quoteStatus === "error" && (
        <div className="info-card calculator-error" role="alert">
          <strong>Не удалось обновить расчёт</strong>
          <p>{quoteError}</p>
        </div>
      )}

      {quote && quoteStatus !== "error" && (
        <div
          ref={quoteCardRef}
          className={`quote-card ${quoteStatus === "ready" ? "" : "is-updating"}`}
          aria-busy={quoteStatus !== "ready"}
          aria-live="polite"
        >
          <span className="eyebrow">
            {quoteStatus === "ready" ? "Предварительный расчёт" : "Обновляем расчёт…"}
          </span>
          <div>
            <small>Вы отдаёте</small>
            <strong>{quoteDisplay(quote, "source", giveCurrency)}</strong>
          </div>
          <div>
            <small>Вы получаете</small>
            <strong>{quoteDisplay(quote, "target", receiveCurrency)}</strong>
          </div>
          <div className="quote-trust-row" aria-label="Срок действия расчёта">
            {quoteTime(quote.calculated_at) && (
              <span>Обновлено {quoteTime(quote.calculated_at)}</span>
            )}
            {quoteTime(quote.expires_at) && (
              <span>Действует до {quoteTime(quote.expires_at)}</span>
            )}
            {quote.manual_confirmation_required && (
              <span>Подтверждает оператор</span>
            )}
          </div>
          <p>
            {quote.warning ||
              "Финальную сумму и способ проведения сделки подтверждает оператор."}
          </p>

          {quoteStatus === "ready" && currentRouteCode === "RUB_BANK_TO_USDT" && (
            <aside className="whitebird-referral">
              <p>
                Для снижения риска банковских ограничений можно самостоятельно
                зарегистрироваться на легальной криптоплатформе WHITEBIRD и
                провести операцию через собственный верифицированный аккаунт.
              </p>
              <a
                className="button secondary"
                href="https://whitebird.io/signup?refid=xI8m5j0M"
                target="_blank"
                rel="noopener noreferrer"
              >
                Зарегистрироваться в WHITEBIRD
              </a>
            </aside>
          )}

          <button
            className="button primary"
            type="button"
            disabled={
              quoteStatus !== "ready" ||
              !quoteId(quote) ||
              requestStatus === "sending" ||
              requestStatus === "sent"
            }
            onClick={createRequest}
          >
            {requestStatus === "sending"
              ? "Отправляем…"
              : requestStatus === "sent"
                ? "Заявка отправлена"
                : "Оставить заявку"}
          </button>
          {requestStatus === "sent" && request && (
            <p className="request-success" role="status">
              Заявка принята. Оператор свяжется с вами для подтверждения.
            </p>
          )}
          {requestStatus === "error" && (
            <p className="request-error" role="alert">{requestError}</p>
          )}
        </div>
      )}

      <aside className="calculator-manager">
        <div>
          <strong>Нужна помощь менеджера?</strong>
          <p>Поможем выбрать маршрут и подтвердим итоговые условия.</p>
        </div>
        <button className="button secondary" type="button" onClick={openManager}>
          Связаться
        </button>
      </aside>
    </section>
  );
}
