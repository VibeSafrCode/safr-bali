import { useId } from "react";
import { visaStatusDescription, visaStatusLabel } from "./visaEditorState";

type Locale = "ru" | "en";
type StatusKind = "visa" | "external";

const help: Record<"visa", Record<string, Record<Locale, string>>> = {
  visa: {
    NOT_ISSUED: { ru: "В SAFRWAY выдача визы ещё не подтверждена менеджером.", en: "Visa issuance has not yet been confirmed by a SAFRWAY manager." },
    ISSUED_NOT_ACTIVATED: { ru: "Менеджер подтвердил выдачу документа о визе; въезд или активация в SAFRWAY ещё не отмечены.", en: "A manager confirmed issuance of the visa document; entry or activation is not yet recorded in SAFRWAY." },
    ACTIVE: { ru: "В SAFRWAY виза отмечена как активная на основании подтверждённых менеджером данных.", en: "SAFRWAY records the visa as active based on manager-confirmed information." },
    EXPIRING: { ru: "В SAFRWAY отмечено приближение подтверждённой контрольной даты; детали уточняйте у менеджера.", en: "SAFRWAY flags an approaching confirmed review date; ask a manager for details." },
    EXTENSION_PROCESSING: { ru: "В SAFRWAY зафиксирован процесс продления; это не подтверждение результата.", en: "SAFRWAY records an extension process; this does not confirm its outcome." },
    EXTENDED: { ru: "Менеджер отметил в SAFRWAY подтверждённое обновление визового периода.", en: "A manager recorded a confirmed visa-period update in SAFRWAY." },
    EXPIRED: { ru: "В SAFRWAY виза отмечена как завершившая срок по подтверждённым данным.", en: "SAFRWAY records the visa period as ended based on confirmed information." },
    CANCELLED: { ru: "В SAFRWAY визовый кейс отмечен как отменённый.", en: "SAFRWAY records the visa case as cancelled." },
    REFUSED: { ru: "В SAFRWAY зафиксирован подтверждённый отказ по визовому кейсу.", en: "SAFRWAY records a confirmed refusal for the visa case." },
    ISSUED: { ru: "В SAFRWAY зафиксирована подтверждённая выдача визы.", en: "SAFRWAY records confirmed visa issuance." },
  },
};

export function statusHelpText(kind: StatusKind, code: string, locale: Locale) {
  if (kind === "external") return visaStatusDescription("external", code, locale);
  return help[kind][code]?.[locale] ?? (locale === "ru"
    ? "Описание этого состояния уточните у менеджера."
    : "Ask a manager to clarify this system state.");
}

export function VisaStatusHelp({ kind, code, locale, showCode = true }: { kind: StatusKind; code: string; locale: Locale; showCode?: boolean }) {
  const id = useId();
  const explanation = statusHelpText(kind, code, locale);
  const statusLabel = kind === "external" ? visaStatusLabel("external", code, locale) : code;
  const label = locale === "ru" ? `Что означает статус ${statusLabel}` : `What status ${statusLabel} means`;
  return <details className="visa-status-help">
    <summary aria-controls={id} aria-label={label}>{showCode && <code>{statusLabel}</code>}<span aria-hidden="true">?</span></summary>
    <p id={id} className="visa-status-help__text">{explanation}<small>{locale === "ru" ? "Это справка о состоянии в системе, а не юридическая консультация." : "This explains the system state and is not legal advice."}</small></p>
  </details>;
}
