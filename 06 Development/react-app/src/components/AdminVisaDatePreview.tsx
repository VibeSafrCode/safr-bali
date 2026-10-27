import React from "react";
import type { VisaCase } from "../api/types";
import { AdminServiceCountdown } from "./AdminServiceCountdown";
import { formatLifeDate, lifeCountdown, type LifeLocale } from "./lifeServices";
import { visaDatePresentation } from "./visaDatePresentation";

type Dates = Pick<VisaCase, "entered_on" | "issued_on" | "entry_deadline" | "stay_end" | "expected_stay_end" | "lifecycle_status">;

// Pure controlled preview. Never saves a date, activates a visa or sends a message.
export function AdminVisaDatePreview({ item, today, locale }: { item: Dates; today: string; locale: LifeLocale }) {
  const ui = (ru: string, en: string) => locale === "ru" ? ru : en;
  const primary = visaDatePresentation(item, locale);
  const end = primary?.value.slice(0, 10) ?? null;
  const count = lifeCountdown(end, today, locale);
  const valid = count ? primary : null;
  const terminal = ["CANCELLED", "REFUSED"].includes(item.lifecycle_status);
  const mismatch = item.lifecycle_status === "EXPIRED" && count !== null && !count.expired;
  const start = (item.entered_on || (end === item.entry_deadline?.slice(0, 10) ? item.issued_on : null))?.slice(0, 10) ?? null;
  return <div className="crm-date-preview" role="status" aria-live="polite" aria-atomic="true">
    <div className="crm-date-preview-copy">
      <strong>{ui("Просмотр срока", "Stay preview")}</strong>
      {valid ? <><span>{valid.label}</span><time dateTime={end!}>{formatLifeDate(end, locale)}</time></> : <span>{ui("Укажите дату, чтобы увидеть счётчик", "Enter a date to see the countdown")}</span>}
      <small>{ui("Просмотр не подтверждает сохранение. Нажмите «Сохранить».", "This preview does not confirm a save. Select Save.")}</small>
    </div>
    <AdminServiceCountdown start={item.lifecycle_status === "EXPIRED" && start && start > today ? null : start}
      end={mismatch ? null : end} today={today} locale={locale} terminal={terminal}
      estimated={valid?.estimated} emptyLabel={mismatch ? ui("Проверьте дату", "Check the date") : ui("Дата уточняется", "Date to be confirmed")} />
  </div>;
}
