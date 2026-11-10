import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, appApiClient } from "../api/client";
import { clientRentalCopy } from "../i18n/client-rental-copy";
import type { ClientUiLocale10 } from "../i18n/client-ui-bindings";
import type { LifeService } from "./lifeServices";
import { sendSupportIntentRequest, type SupportApiPrefix } from "./support-intent";

const rentalCurrencies = ["IDR", "RUB", "USD", "USDT"];
const transferCurrencies = ["IDR", "RUB", "USD", "EUR", "USDT"];

type RentalActionsProps = {
  apiPrefix: SupportApiPrefix;
  csrfToken?: string;
  userId: number;
  language: ClientUiLocale10;
  retryKeys: Map<string, string>;
};

function exactRentalAmount(value: string) {
  const amount = value.trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - "٠".charCodeAt(0)))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - "۰".charCodeAt(0)))
    .replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - "०".charCodeAt(0)))
    .replace(/[,٫]/, ".");
  return /^\d{1,14}(\.\d{1,2})?$/.test(amount) && /[1-9]/.test(amount) ? amount : null;
}

function field(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export function rentalPaymentRequest(item: Pick<LifeService, "id" | "price_currency" | "end_date">, title: string, data: {
  amount: string; preferredCurrency: string; start: string; end: string;
}) {
  const amount = exactRentalAmount(data.amount);
  const preferred = data.preferredCurrency.trim().toUpperCase();
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000") &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!amount || !/^[A-Z]{3,8}$/.test(preferred) || !validDate(data.start) || !validDate(data.end) || data.end < data.start) return null;
  return {
    body: [
      `Оплата аренды арендодателю · карточка #${item.id}`,
      title.replace(/\s+/g, " "),
      `Оплачиваемый период: ${data.start} — ${data.end}`,
      `Сумма к оплате арендодателю: ${amount} ${item.price_currency}`,
      `Валюта перевода клиента: ${preferred}`,
      ...(item.end_date ? [`Окончание аренды по карточке: ${item.end_date}`] : []),
    ].join("\n"),
    route_context: { section: "Оплата аренды", service: `rental-${item.id}` },
  };
}

function closeRentalForm(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== "Escape" || !event.currentTarget.open || event.defaultPrevented) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.open = false;
  event.currentTarget.querySelector("summary")?.focus();
}

function useRentalWrite(retryKeys: Map<string, string>) {
  const attempt = useRef<AbortController | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "invalid" | "retry" | "saved">("idle");
  useEffect(() => () => attempt.current?.abort(), []);

  async function submit<T>(signature: string, write: (key: string, signal: AbortSignal) => Promise<T>, onSaved: (result: T) => void) {
    if (attempt.current && !attempt.current.signal.aborted) return;
    const controller = new AbortController();
    attempt.current = controller;
    setState("busy");
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (attempt.current === controller) {
        attempt.current = null;
        setState("retry");
      }
    }, 15000);
    try {
      const key = retryKeys.get(signature) ?? crypto.randomUUID();
      retryKeys.set(signature, key);
      const result = await write(key, controller.signal);
      if (controller.signal.aborted) return;
      retryKeys.delete(signature);
      setState("saved");
      onSaved(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      const invalid = error instanceof ApiError && error.status === 422;
      if (invalid) retryKeys.delete(signature);
      setState(invalid ? "invalid" : "retry");
    } finally {
      window.clearTimeout(timeout);
      if (attempt.current === controller) attempt.current = null;
    }
  }

  return { state, submit, setState };
}

export function AddRental({ apiPrefix, csrfToken, userId, language, retryKeys, onAdded }: RentalActionsProps & {
  onAdded: (item: LifeService, opener: HTMLElement | null) => void;
}) {
  const t = clientRentalCopy[language];
  const [monthly, setMonthly] = useState(true);
  const details = useRef<HTMLDetailsElement>(null);
  const { state, submit, setState } = useRentalWrite(retryKeys);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = exactRentalAmount(field(data, "amount"));
    const start = field(data, "start"), end = field(data, "end");
    const title = field(data, "title");
    if (!amount || !title || (end && end < start)) {
      setState("invalid");
      return;
    }
    const payload = {
      kind: field(data, "kind"), title, rental_mode: monthly ? "monthly" : "fixed",
      start_date: start, end_date: end || null, price_amount: amount,
      price_currency: field(data, "currency"), expected_actor_telegram_id: userId,
    };
    void submit(JSON.stringify(payload), async (key, signal) => {
      const api = appApiClient();
      let token = csrfToken;
      if (apiPrefix === "/mini-app") {
        const identity = await api.request<{ telegram_id: number; csrf_token: string }>("/mini-app/preferences/ui-locale", { signal });
        if (identity?.telegram_id !== userId || !identity.csrf_token) {
          throw new ApiError("Rental actor changed", { kind: "authentication", status: 401 });
        }
        token = identity.csrf_token;
      }
      if (signal.aborted) throw new DOMException("Rental save cancelled", "AbortError");
      return api.request<LifeService>(`${apiPrefix}/life-services`, {
        method: "POST", signal,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token ?? "" },
        body: JSON.stringify({ ...payload, idempotency_key: key }),
      });
    }, (item) => {
      form.reset();
      setMonthly(true);
      if (details.current) details.current.open = false;
      onAdded(item, details.current?.querySelector("summary") ?? null);
    });
  }

  return <div className="life-rental-action">
    <details ref={details} onKeyDown={closeRentalForm}>
      <summary className="button secondary">{t.add}</summary>
      <form className="life-rental-form" onSubmit={save}>
        <fieldset disabled={state === "busy"}>
          <label>{t.kind}
            <select name="kind"><option value="housing">{t.villa}</option><option value="bike">{t.bike}</option></select>
          </label>
          <label>{t.title}<input name="title" required maxLength={200} /></label>
          <label>{t.term}
            <select value={monthly ? "monthly" : "fixed"} onChange={(event) => setMonthly(event.target.value === "monthly")}>
              <option value="monthly">{t.monthly}</option><option value="fixed">{t.fixed}</option>
            </select>
          </label>
          <div className="life-rental-fields">
            <label>{t.start}<input name="start" type="date" min="0001-01-01" max="9999-12-31" required /></label>
            <label>{t.end}<input name="end" type="date" min="0001-01-01" max="9999-12-31" required={!monthly} /></label>
          </div>
          <div className="life-rental-fields">
            <label>{t.amount}<input name="amount" inputMode="decimal" required maxLength={17} /></label>
            <label>{t.currency}<select name="currency">{rentalCurrencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          </div>
          <button className="button primary" type="submit">{state === "busy" ? t.busy : t.save}</button>
        </fieldset>
        {(state === "invalid" || state === "retry") && <p role="alert">{t[state]}</p>}
      </form>
    </details>
    {state === "saved" && <p role="status">{t.saved}</p>}
  </div>;
}

export function PayRental({ apiPrefix, csrfToken, userId, language, retryKeys, item, title }: RentalActionsProps & {
  item: LifeService;
  title: string;
}) {
  const t = clientRentalCopy[language];
  const [currency, setCurrency] = useState<string>(item.price_currency);
  const details = useRef<HTMLDetailsElement>(null);
  const { state, submit, setState } = useRentalWrite(retryKeys);

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saved") return;
    const data = new FormData(event.currentTarget);
    const request = rentalPaymentRequest(item, title, {
      amount: field(data, "amount"), preferredCurrency: currency === "other" ? field(data, "other") : currency,
      start: field(data, "start"), end: field(data, "end"),
    });
    if (!request) {
      setState("invalid");
      return;
    }
    void submit(request.body, (key, signal) => sendSupportIntentRequest(apiPrefix, userId, JSON.stringify({
      ...request, idempotency_key: key, expected_actor_telegram_id: userId,
    }), signal, appApiClient().request, csrfToken), () => {
      const disclosure = details.current;
      if (disclosure?.open && (disclosure.contains(document.activeElement) || document.activeElement === document.body)) {
        disclosure.querySelector("summary")?.focus();
      }
    });
  }

  return <details className="life-rental-action" ref={details} onKeyDown={closeRentalForm}>
    <summary className="button primary">{t.pay}</summary>
    <div role="status">{state === "saved" && <p>{t.sent}</p>}</div>
    {state !== "saved" && <form className="life-rental-form" onSubmit={send}>
      <fieldset disabled={state === "busy"}>
        <div className="life-rental-fields">
          <label>{t.paymentStart}<input name="start" type="date" min="0001-01-01" max="9999-12-31" required /></label>
          <label>{t.paymentEnd}<input name="end" type="date" min="0001-01-01" max="9999-12-31" required /></label>
        </div>
        <label>{t.amount} ({item.price_currency})
          <input name="amount" inputMode="decimal" defaultValue={item.price_unit === "day" ? "" : item.price_amount ?? ""} required maxLength={17} />
        </label>
        <label>{t.payCurrency}
          <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {transferCurrencies.map((code) => <option key={code}>{code}</option>)}
            <option value="other">{t.other}</option>
          </select>
        </label>
        {currency === "other" && <label>{t.currencyCode}<input name="other" required minLength={3} maxLength={8} dir="ltr" /></label>}
        <p>{t.help}</p>
        <button className="button primary" type="submit">{state === "busy" ? t.busy : t.send}</button>
      </fieldset>
      {(state === "invalid" || state === "retry") && <p role="alert">{t[state]}</p>}
    </form>}
  </details>;
}
