import React from "react";
import type { VisaCase } from "../api/types";
import { AdminServiceCountdown } from "./AdminServiceCountdown";
import { AppIcon } from "./AppIcon";
import { visaDatePresentation } from "./VisaCabinet";
import { formatLifeDate, lifeCountdown, type LifeLocale } from "./lifeServices";
import { visaStatusLabel } from "./visaEditorState";

type VisaTileRecord = Pick<VisaCase, "custom_visa_name" | "lifecycle_status" | "issued_on" | "entered_on" | "entry_deadline" | "stay_end" | "expected_stay_end" | "next_action_text"> & {
  visa_type: { code: string; name: string };
  publication_status: string;
};

// Display only. The existing editor owns every date/status change and API write.
export function AdminVisaTile({ item, today, locale, onOpen }: {
  item: VisaTileRecord; today: string; locale: LifeLocale; onOpen: () => void;
}) {
  const ui = (ru: string, en: string) => locale === "ru" ? ru : en;
  const primaryDate = visaDatePresentation(item, locale);
  const end = primaryDate?.value.slice(0, 10) ?? null;
  const count = lifeCountdown(end, today, locale);
  const date = count ? primaryDate : null;
  const start = (item.entered_on || (end === item.entry_deadline?.slice(0, 10) ? item.issued_on : null))?.slice(0, 10) ?? null;
  const terminal = ["CANCELLED", "REFUSED"].includes(item.lifecycle_status);
  // A terminal visa status must never coexist with an active/future countdown.
  const expiryMismatch = item.lifecycle_status === "EXPIRED" && count !== null && !count.expired;
  const countdownStart = item.lifecycle_status === "EXPIRED" && start && start > today ? null : start;
  const visibility = item.publication_status === "PUBLISHED" ? ui("В кабинете клиента", "In client account") : item.publication_status === "DRAFT" ? ui("Черновик", "Draft") : ui("Скрыто", "Hidden");

  return <button type="button" onClick={onOpen}>
    <span className="admin-life-tile-top">
      <span className="admin-life-tile-icon"><AppIcon name="▣"/></span>
      <span className="admin-life-tile-status">{visibility}</span>
    </span>
    <span className="admin-service-tile-main">
      <span className="admin-life-tile-copy">
        <small>{ui("Виза · Индонезия", "Visa · Indonesia")}</small>
        <strong>{item.custom_visa_name || item.visa_type.name || item.visa_type.code}</strong>
        <small className="admin-visa-state">{visaStatusLabel("lifecycle", item.lifecycle_status, locale)}</small>
      </span>
      <AdminServiceCountdown start={countdownStart} end={expiryMismatch ? null : end} today={today} locale={locale} terminal={terminal} estimated={date?.estimated} emptyLabel={expiryMismatch ? ui("Проверьте дату", "Check the date") : ui("Дата уточняется", "Date to be confirmed")}/>
    </span>
    <span className="admin-life-tile-date">
      {date ? <><small>{date.label}</small><time dateTime={end!}>{formatLifeDate(end, locale)}</time></> : <small>{ui("Дата уточняется", "Date to be confirmed")}</small>}
      {item.next_action_text && <span className="admin-visa-next-action">{item.next_action_text}</span>}
    </span>
  </button>;
}
