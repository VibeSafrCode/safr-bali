import React from "react";
import { newStaffStayDraft, reviewStaffStayDraft, staffStayAvailable, staffStayBindingMatches, type StaffStayCase, type StaffStayDraft } from "./adminVisaStayActionDraft";

export function AdminVisaStayAction({ item, draft, today, locale, disabled, onChange }: {
  item: StaffStayCase; draft: StaffStayDraft; today: string; locale: "ru" | "en";
  disabled: boolean; onChange: (draft: StaffStayDraft) => void;
}) {
  const ui = (ru: string, en: string) => locale === "ru" ? ru : en;
  const update = (patch: Partial<StaffStayDraft>) => onChange({ ...draft, ...patch, acknowledged: false });
  const available = staffStayAvailable(item);
  const stale = !staffStayBindingMatches(draft, item);
  const extensions = item.processes?.filter(p => p.type === "EXTENSION") ?? [];
  const choose = (kind: StaffStayDraft["kind"]) => {
    if (draft.kind !== kind) onChange(newStaffStayDraft(item, kind));
  };
  return <section className="crm-stay-action" aria-label={ui("Подтверждение въезда и продления", "Confirm entry or extension")}>
    <div className="crm-stay-action-buttons" role="group" aria-label={ui("Действие менеджера", "Manager action")}>
      <button type="button" className="button secondary" disabled={disabled || !available} aria-pressed={draft.kind === "CONFIRM_ENTRY"} onClick={() => choose("CONFIRM_ENTRY")}>{ui("Влетел · подтвердить", "Entered · confirm")}</button>
      <button type="button" className="button secondary" disabled={disabled || !available || item.lifecycle_status === "ISSUED_NOT_ACTIVATED"} aria-pressed={draft.kind === "CONFIRM_EXTENSION"} onClick={() => choose("CONFIRM_EXTENSION")}>{ui("Продлил · подтвердить", "Extended · confirm")}</button>
    </div>
    {!available && <p>{ui("Быстрые действия недоступны: сначала проверьте статус дела.", "Quick actions are unavailable: review the case status first.")}</p>}
    {stale && draft.kind !== "NONE" && <div role="status"><p>{ui("Карточка обновилась. Сверьте введённые данные с новой версией перед подтверждением.", "The case was refreshed. Review your draft against the new version before confirming.")}</p>
      {draft.caseId === item.id && <button type="button" className="button secondary" disabled={disabled} onClick={() => onChange(reviewStaffStayDraft(draft, item))}>{ui("Сверить с обновлённой карточкой", "Review against the refreshed case")}</button>}
    </div>}
    {draft.kind !== "NONE" && <fieldset disabled={disabled || stale}>
      <legend>{draft.kind === "CONFIRM_ENTRY" ? ui("Подтвердить въезд", "Confirm entry") : ui("Подтвердить конкретное продление", "Confirm a specific extension")}</legend>
      {draft.kind === "CONFIRM_ENTRY" ? <>
        <label>{ui("Подтверждаемая дата въезда", "Entry date to confirm")}<input type="date" value={draft.enteredOn} min={item.issued_on ?? undefined} max={today} onChange={e => update({ enteredOn: e.target.value })} /></label>
        <p>{ui("Выберите период ниже для предварительного счётчика и сохраните вместе с въездом. Без выбора правила окончание не придумывается. Подтверждённый срок документа не заменяется расчётом.", "Choose a period below for a provisional countdown and save it with entry. Without an explicit rule, no expiry is invented. A calculation never replaces the confirmed document expiry.")}</p>
      </> : <>
        <label>{ui("Процесс продления", "Extension process")}<select value={draft.processId} onChange={e => update({ processId: e.target.value })}>
          <option value="">{ui("Выберите процесс", "Select a process")}</option>
          {extensions.map(p => <option key={p.id} value={p.id}>{`EXTENSION #${p.id} · ${p.external_status}`}</option>)}
        </select></label>
        {!extensions.length && <p className="admin-risk">{ui("Сначала добавьте и сохраните процесс EXTENSION в редакторе процессов. Это подтверждение существующего продления, не автоматическая прибавка дней.", "First add and save an EXTENSION process in the process editor. This confirms an existing extension; it does not automatically add days.")}</p>}
        <label>{ui("Новое окончание из документа", "New expiry from the document")}<input type="date" value={draft.documentEnd} onChange={e => update({ documentEnd: e.target.value })} /></label>
        {item.expected_stay_end && <label className="crm-stay-ack"><input type="checkbox" checked={draft.clearExpected} onChange={e => update({ clearExpected: e.target.checked })} /><span>{ui("Убрать прежний прогноз после сверки с документом (история сохраняется)", "Remove the previous forecast after checking the document (history is preserved)")} · {item.expected_stay_end}</span></label>}
        <p>{ui("Счётчик продлений увеличится один раз для выбранного процесса. Прежний расчёт следующего срока не будет пересчитан автоматически.", "The recorded extension count increases once for this process. The previous next-expiry estimate is not automatically recalculated.")}</p>
      </>}
      <label>{ui("Основание подтверждения · документ / проверка", "Confirmation evidence · document / check")}<input maxLength={2000} value={draft.source} onChange={e => update({ source: e.target.value })} /></label>
      <label>{ui("Причина действия", "Action reason")}<textarea maxLength={2000} value={draft.reason} onChange={e => update({ reason: e.target.value })} /></label>
      <label className="crm-stay-ack"><input type="checkbox" checked={draft.acknowledged} onChange={e => onChange({ ...draft, acknowledged: e.target.checked })} /><span>{ui("Я проверил дату и основание. Действие применится при сохранении карточки.", "I checked the date and evidence. The action is applied when the case is saved.")}</span></label>
      <button type="button" className="button secondary" onClick={() => choose("NONE")}>{ui("Отменить действие", "Cancel action")}</button>
    </fieldset>}
  </section>;
}
