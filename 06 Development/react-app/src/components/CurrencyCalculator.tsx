import { useEffect, useMemo, useRef, useState } from "react";

import { appApiClient } from "../api/client";
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
import { localizedApiError, useI18n } from "../i18n/runtime";

type CurrencyCalculatorProps = {
  navigate: (path: string) => void;
  onManager: (context: RouteContext) => void;
  onHaptic?: () => void;
  apiPrefix?: "/mini-app" | "/api/web";
  csrfToken?: string;
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

function quoteTime(value: string | undefined, locale: "ru" | "en") {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function CurrencyCalculator({
  navigate,
  onManager,
  onHaptic,
  apiPrefix = "/mini-app",
  csrfToken,
}: CurrencyCalculatorProps) {
  const { locale, t } = useI18n();
  const bali = destinationById("bali", locale);
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
          `${apiPrefix}/exchange/options`,
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
          setQuoteError(localizedApiError(locale, caught));
          setOptionsStatus("error");
        }
      }
    }
    void loadOptions();
    return () => controller.abort();
  }, [api, apiPrefix]);

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
          `${apiPrefix}/exchange/quotes`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
            },
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
        setQuoteError(localizedApiError(locale, caught));
        setQuoteStatus("error");
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [amount, api, apiPrefix, csrfToken, mode, pair]);

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
        `${apiPrefix}/exchange/requests`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          },
          body: JSON.stringify({ quote_id: id }),
        },
      );
      setRequest(result);
      setRequestStatus("sent");
      onHaptic?.();
    } catch (caught) {
      setRequestError(localizedApiError(locale, caught));
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
      context={t("calculator.context")}
      backLabel={t("calculator.backToBali")}
      onBack={() => navigate("services/bali/exchange")}
    />
  ) : null;

  if (optionsStatus === "loading") {
    return (
      <section className="page-stack">
        {countryHeader}
        <header className="page-heading calculator-heading">
          <h1>{t("calculator.title")}</h1>
          <p>{t("calculator.loadingOptions")}</p>
        </header>
        <div className="quote-skeleton" role="status" aria-label={t("calculator.loadingAria")} />
      </section>
    );
  }

  if (optionsStatus === "error" || !options || !enabledPairs.length) {
    return (
      <section className="page-stack">
        {countryHeader}
        <header className="page-heading calculator-heading">
          <h1>{t("calculator.unavailable.title")}</h1>
          <p>{quoteError || t("calculator.unavailable.noRoutes")}</p>
        </header>
        <button className="button secondary" type="button" onClick={openManager}>
          {t("calculator.writeManager")}
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
        <h1>{t("calculator.title")}</h1>
        <p>{t("calculator.description")}</p>
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
          <legend>{t("calculator.mode.legend")}</legend>
          <div className="choice-grid mode-choice">
            <button
              className={mode === "GIVE" ? "selected" : ""}
              type="button"
              aria-pressed={mode === "GIVE"}
              disabled={!supportsGive}
              onClick={() => selectMode("GIVE")}
            >
              {t("calculator.mode.give")}
            </button>
            <button
              className={mode === "RECEIVE" ? "selected" : ""}
              type="button"
              aria-pressed={mode === "RECEIVE"}
              disabled={!supportsReceive}
              onClick={() => selectMode("RECEIVE")}
            >
              {t("calculator.mode.receive")}
            </button>
          </div>
        </fieldset>
        <label className="amount-field">
          <span>{t("calculator.amount.label")}</span>
          <span className="amount-control">
            <input
              aria-label={
                mode === "GIVE" ? t("calculator.amount.giveAria") : t("calculator.amount.receiveAria")
              }
              autoComplete="off"
              inputMode="decimal"
              placeholder={mode === "GIVE" ? t("calculator.amount.givePlaceholder") : t("calculator.amount.receivePlaceholder")}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <b aria-hidden="true">{currencySymbols[amountAsset] ?? amountAsset}</b>
          </span>
        </label>
        <small className="live-quote-hint">{t("calculator.liveHint")}</small>
      </div>

      {quoteStatus === "idle" && (
        <div className="quote-empty" role="status">
          <strong>{t("calculator.idle.title")}</strong>
          <p>{t("calculator.idle.detail")}</p>
        </div>
      )}

      {(quoteStatus === "debouncing" || quoteStatus === "loading") && !quote && (
        <div className="quote-skeleton" role="status" aria-live="polite">
          <span>{t("calculator.updating")}</span>
        </div>
      )}

      {quoteStatus === "error" && (
        <div className="info-card calculator-error" role="alert">
          <strong>{t("calculator.error.title")}</strong>
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
            {quoteStatus === "ready" ? t("calculator.quote.preliminary") : t("calculator.quote.updating")}
          </span>
          <div>
            <small>{t("calculator.quote.give")}</small>
            <strong>{quoteDisplay(quote, "source", giveCurrency)}</strong>
          </div>
          <div>
            <small>{t("calculator.quote.receive")}</small>
            <strong>{quoteDisplay(quote, "target", receiveCurrency)}</strong>
          </div>
          <div className="quote-trust-row" aria-label={t("calculator.quote.validityAria")}>
            {quoteTime(quote.calculated_at, locale) && (
              <span>{t("calculator.quote.updated", { time: quoteTime(quote.calculated_at, locale) })}</span>
            )}
            {quoteTime(quote.expires_at, locale) && (
              <span>{t("calculator.quote.expires", { time: quoteTime(quote.expires_at, locale) })}</span>
            )}
            {quote.manual_confirmation_required && (
              <span>{t("calculator.quote.operatorConfirms")}</span>
            )}
          </div>
          <p>
            {locale === "en"
              ? t("calculator.quote.defaultWarning")
              : quote.warning || t("calculator.quote.defaultWarning")}
          </p>

          {quoteStatus === "ready" && currentRouteCode === "RUB_BANK_TO_USDT" && (
            <aside className="whitebird-referral">
              <p>{t("calculator.whitebird.detail")}</p>
              <a
                className="button secondary"
                href="https://whitebird.io/signup?refid=xI8m5j0M"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("calculator.whitebird.action")}
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
              ? t("calculator.request.sending")
              : requestStatus === "sent"
                ? t("calculator.request.sent")
                : t("calculator.request.submit")}
          </button>
          {requestStatus === "sent" && request && (
            <p className="request-success" role="status">
              {t("calculator.request.success")}
            </p>
          )}
          {requestStatus === "error" && (
            <p className="request-error" role="alert">{requestError}</p>
          )}
        </div>
      )}

      <aside className="calculator-manager">
        <div>
          <strong>{t("calculator.manager.title")}</strong>
          <p>{t("calculator.manager.detail")}</p>
        </div>
        <button className="button secondary" type="button" onClick={openManager}>
          {t("calculator.manager.contact")}
        </button>
      </aside>
    </section>
  );
}
