import { useId } from "react";
import { visaStatusDescription, visaStatusLabel } from "./visaEditorState";
import { presentationCopy } from '../ui/presentation-copy';

export type StatusHelpLocale = "ru" | "en";
export type StatusHelpKind = "visa" | "external";
type Locale=StatusHelpLocale;
type StatusKind=StatusHelpKind;
export type VisaStatusHelpPresentation=Readonly<{explanation:string;statusLabel:string;label:string;disclaimer:string}>;
export type VisaStatusHelpProps={kind:StatusKind;code:string;locale:Locale;showCode?:boolean;presentation?:VisaStatusHelpPresentation};

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

export function hasVisaStatusHelp(code:string){return Object.hasOwn(help.visa,code);}
export function statusHelpText(kind: StatusKind, code: string, locale: Locale) {
  if (kind === "external") return visaStatusDescription("external", code, locale);
  return help[kind][code]?.[locale] ?? (locale === "ru"
    ? "Описание этого состояния уточните у менеджера."
    : "Ask a manager to clarify this system state.");
}

// Lightweight shared renderer: Admin and Yoga retain RUEN without importing
// the Main customer dictionaries. The Main adapter supplies presentation only.
export function VisaStatusHelp({ kind, code, locale, showCode = true, presentation }: VisaStatusHelpProps) {
  const id = useId();
  const explanation = presentationCopy(presentation?.explanation??statusHelpText(kind, code, locale));
  const statusLabel = presentation?.statusLabel??(kind === "external" ? visaStatusLabel("external", code, locale) : code);
  const label = presentation?.label??(locale === "ru" ? `Что означает статус ${statusLabel}` : `What status ${statusLabel} means`);
  const disclaimer = presentation?.disclaimer??(locale === "ru" ? "Это справка о состоянии в системе, а не юридическая консультация." : "This explains the system state and is not legal advice.");
  return <details className="visa-status-help">
    <summary aria-controls={id} aria-label={label}>{showCode && <code>{statusLabel}</code>}<span aria-hidden="true">?</span></summary>
    <p id={id} className="visa-status-help__text">{explanation}<small>{disclaimer}</small></p>
  </details>;
}
