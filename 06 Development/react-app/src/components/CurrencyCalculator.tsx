import { useEffect, useMemo, useState } from "react";
import { apiErrorMessage, appApiClient } from "../api/client";
import type {
  ExchangeOptions,
  ExchangePair,
  ExchangeQuote,
  RouteContext,
} from "../api/types";

type CurrencyCalculatorProps = {
  navigate: (path: string) => void;
  onManager: (context: RouteContext) => void;
};

const currencySymbols: Record<string, string> = {
  USDT: "USDT",
  IDR_CASH: "IDR",
  IDR_BANK: "IDR",
  RUB_BANK: "RUB",
};

function decimalInput(value: string) {
  return value.trim().replaceAll(" ", "").replace(",", ".");
}

function money(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: currency === "USDT" ? 8 : 0,
  }).format(amount)} ${currencySymbols[currency] ?? currency}`;
}

export function CurrencyCalculator({
  navigate,
  onManager,
}: CurrencyCalculatorProps) {
  const api = useMemo(() => appApiClient(), []);
  const [options, setOptions] = useState<ExchangeOptions | null>(null);
  const [giveCurrency, setGiveCurrency] = useState("");
  const [receiveCurrency, setReceiveCurrency] = useState("");
  const [amountSide, setAmountSide] = useState<"give" | "receive">("give");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<ExchangeQuote | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "calculating" | "error">(
    "loading",
  );
  const [error, setError] = useState("");

  const pair =
    options?.supported_pairs.find(
      (entry) =>
        entry.give_currency === giveCurrency &&
        entry.receive_currency === receiveCurrency,
    ) ?? null;
  const selectionComplete = Boolean(giveCurrency && receiveCurrency);

  useEffect(() => {
    const controller = new AbortController();
    async function loadOptions() {
      try {
        const result = await api.request<ExchangeOptions>(
          "/mini-app/exchange/options",
          { signal: controller.signal },
        );
        setOptions(result);
        setStatus("ready");
      } catch (caught) {
        if ((caught as DOMException).name !== "AbortError") {
          setError(apiErrorMessage(caught));
          setStatus("error");
        }
      }
    }
    void loadOptions();
    return () => controller.abort();
  }, [api]);

  function selectGive(value: string) {
    setGiveCurrency(value);
    setQuote(null);
    setAmount("");
    setAmountSide("give");
    setError("");
  }

  function selectReceive(value: string) {
    setReceiveCurrency(value);
    setQuote(null);
    setAmount("");
    setAmountSide("give");
    setError("");
  }

  async function calculate() {
    if (!pair || !decimalInput(amount)) return;
    setStatus("calculating");
    setError("");
    setQuote(null);
    try {
      const result = await api.request<ExchangeQuote>(
        "/mini-app/exchange/quotes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            give_currency: pair.give_currency,
            receive_currency: pair.receive_currency,
            amount: decimalInput(amount),
            amount_side: amountSide,
          }),
        },
      );
      setQuote(result);
      setStatus("ready");
    } catch (caught) {
      setError(apiErrorMessage(caught));
      setStatus("ready");
    }
  }

  function openManager() {
    onManager({
      country: "Бали",
      section: "Обмен валюты",
      service: selectionComplete
        ? `${giveCurrency} → ${receiveCurrency}`
        : "Калькулятор обмена",
    });
  }

  if (status === "loading") {
    return (
      <section className="page-stack">
        <header className="page-heading">
          <span className="eyebrow">Бали · обмен валюты</span>
          <h1>Калькулятор</h1>
          <p>Загружаем доступные направления…</p>
        </header>
      </section>
    );
  }

  if (status === "error" || !options) {
    return (
      <section className="page-stack">
        <header className="page-heading">
          <button
            className="text-back"
            type="button"
            onClick={() => navigate("services/bali/exchange")}
          >
            ← Обмен валюты
          </button>
          <h1>Калькулятор временно недоступен</h1>
          <p>{error}</p>
        </header>
        <button className="button secondary" type="button" onClick={openManager}>
          Написать менеджеру
        </button>
      </section>
    );
  }

  return (
    <section className="page-stack calculator-page">
      <header className="page-heading">
        <button
          className="text-back"
          type="button"
          onClick={() => navigate("services/bali/exchange")}
        >
          ← Обмен валюты
        </button>
        <span className="eyebrow">Бали · предварительный расчёт</span>
        <h1>Калькулятор обмена</h1>
        <p>
          Сначала выберите, что отдаёте и что хотите получить. Расчёт
          выполняется внутри Mini App и не отправляет команды в бот.
        </p>
      </header>

      <div className="calculator-card">
        <fieldset className="currency-choice">
          <legend>Что отдаёте</legend>
          <div className="choice-grid">
            {options.give.map((entry) => (
              <button
                className={giveCurrency === entry.code ? "selected" : ""}
                key={entry.code}
                type="button"
                onClick={() => selectGive(entry.code)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="currency-choice">
          <legend>Что получаете</legend>
          <div className="choice-grid">
            {options.receive.map((entry) => (
              <button
                className={receiveCurrency === entry.code ? "selected" : ""}
                disabled={giveCurrency === entry.code}
                key={entry.code}
                type="button"
                onClick={() => selectReceive(entry.code)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {selectionComplete && !pair && (
        <div className="info-card calculator-manual">
          <strong>Для этого направления пока нужен ручной расчёт</strong>
          <p>
            Напишите менеджеру — он проверит доступный маршрут и актуальные
            условия. Автоматическую формулу мы добавим после отдельного
            согласования.
          </p>
          <button className="button secondary" type="button" onClick={openManager}>
            Запросить расчёт
          </button>
        </div>
      )}

      {pair && (
        <div className="calculator-card">
          <fieldset className="currency-choice">
            <legend>Какую сумму вы знаете</legend>
            <div className="choice-grid mode-choice">
              <button
                className={amountSide === "give" ? "selected" : ""}
                type="button"
                onClick={() => {
                  setAmountSide("give");
                  setAmount("");
                  setQuote(null);
                }}
              >
                Сколько отдаю
              </button>
              <button
                className={amountSide === "receive" ? "selected" : ""}
                type="button"
                onClick={() => {
                  setAmountSide("receive");
                  setAmount("");
                  setQuote(null);
                }}
              >
                Сколько хочу получить
              </button>
            </div>
          </fieldset>
          <label className="amount-field">
            <span>
              {amountSide === "give"
                ? "Сколько отдаёте"
                : "Сколько хотите получить"}
            </span>
            <input
              autoComplete="off"
              inputMode="decimal"
              placeholder={amountSide === "give" ? "Например, 100" : "Например, 20 000"}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setQuote(null);
                setError("");
              }}
            />
          </label>
          <button
            className="button primary"
            disabled={!decimalInput(amount) || status === "calculating"}
            type="button"
            onClick={calculate}
          >
            {status === "calculating" ? "Считаем…" : "Рассчитать"}
          </button>
          {error && <p className="error-message">{error}</p>}
        </div>
      )}

      {quote && (
        <div className="quote-card" aria-live="polite">
          <span className="eyebrow">Предварительный расчёт</span>
          <div>
            <small>Вы отдаёте</small>
            <strong>{money(quote.give_amount, quote.give_currency)}</strong>
          </div>
          <div>
            <small>Вы получаете</small>
            <strong>
              {money(quote.receive_amount, quote.receive_currency)}
            </strong>
          </div>
          <p>
            Итоговую сумму и способ передачи подтверждает оператор перед
            сделкой. Скрытых доплат к подтверждённой цене нет.
          </p>
          <button className="button primary" type="button" onClick={openManager}>
            Оставить заявку менеджеру
          </button>
        </div>
      )}
    </section>
  );
}
