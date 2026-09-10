import type { PointsHistory as History } from "../api/types";
import "./account-details.css";

const text = {
  ru: { title: "История Points", empty: "Операций пока нет", unavailable: "История временно недоступна. Баланс показан выше.", more: "Показаны последние операции. За более ранней историей обратитесь в поддержку.", after: "Баланс после операции", operation: "Операция Points", referral_accrual: "За приглашение", referral_reversal: "Отмена начисления за приглашение", manual_accrual: "Начисление", manual_deduction: "Списание" },
  en: { title: "Points history", empty: "No transactions yet", unavailable: "History is temporarily unavailable. Your balance is shown above.", more: "Showing recent transactions. Contact support for earlier history.", after: "Balance after transaction", operation: "Points transaction", referral_accrual: "Referral reward", referral_reversal: "Referral reward reversal", manual_accrual: "Points credited", manual_deduction: "Points deducted" },
} as const;

export function PointsHistory({ history, locale }: { history?: History; locale: "ru" | "en" }) {
  const copy = text[locale];
  const number = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-GB");
  const labels: Record<string, string> = {
    referral_accrual: copy.referral_accrual,
    referral_reversal: copy.referral_reversal,
    manual_accrual: copy.manual_accrual,
    manual_deduction: copy.manual_deduction,
  };
  return <section className="account-detail-card points-history" aria-label={copy.title}>
    <h2>{copy.title}</h2>
    {!history ? <p role="status">{copy.unavailable}</p> : !history.items.length ? <p>{copy.empty}</p> : <>
      <ol>
        {history.items.map((item) => {
          const label = Object.hasOwn(labels, item.operation_type) ? labels[item.operation_type] : copy.operation;
          const date = new Date(item.created_at);
          return <li key={item.id}>
            <div><strong>{label}</strong><time dateTime={item.created_at}>{Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}</time></div>
            <div className="points-history-amount"><strong>{item.amount > 0 ? "+" : ""}{number.format(item.amount)} Points</strong><small>{copy.after}: {number.format(item.balance_after)}</small></div>
          </li>;
        })}
      </ol>
      {history.has_more && <p>{copy.more}</p>}
    </>}
  </section>;
}
