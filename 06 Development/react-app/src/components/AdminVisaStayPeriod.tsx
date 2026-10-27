import React, { useId } from "react";
import { AdminServiceCountdown } from "./AdminServiceCountdown";
import { formatLifeDate } from "./lifeServices";
import { adminStayPeriodPreset, presetAdminStaySelection, newAdminStaySelection, readyAdminStayEstimate, savedAdminStayRule, staySelectionBindingMatches,
  type AdminStaySelectionDraft, type StayPurpose, type StaySelectionCase } from "./adminVisaStaySelection";

export function AdminVisaStayPeriod({ item, draft, today, locale, disabled, onChange }: {
  item: StaySelectionCase; draft: AdminStaySelectionDraft; today: string; locale: "ru" | "en";
  disabled: boolean; onChange: (draft: AdminStaySelectionDraft) => void;
}) {
  const id = useId();
  const ui = (ru: string, en: string) => locale === "ru" ? ru : en;
  const title = (purpose: StayPurpose) => purpose === "INITIAL" ? ui("После въезда", "After entry") : ui("Продление", "Extension");
  const update = (patch: Partial<AdminStaySelectionDraft>) => onChange({ ...draft, ...patch, acknowledged: false });
  const bindingCurrent = staySelectionBindingMatches(draft, item);
  const unavailableType = !Number.isSafeInteger(item.visa_type.id) || (item.visa_type.id ?? 0) < 1
    || !Number.isSafeInteger(item.visa_type.version) || (item.visa_type.version ?? 0) < 1;
  const purposeSlot = item.stay_estimates?.[draft.purpose === "INITIAL" ? "initial" : "extension"];
  const terminal = ["EXPIRED", "CANCELLED", "REFUSED"].includes(item.lifecycle_status);
  const needsReview = purposeSlot?.state === "INVALID_SNAPSHOT"
    || (purposeSlot?.state === "REVIEW_REQUIRED" && purposeSlot.review_reason !== "TERMINAL_CASE");
  const preset = adminStayPeriodPreset(item, draft.purpose);
  const stateCopy = (state: string | undefined, reason?: string) => reason === "ENTRY_CALCULATION_INVALID"
    ? ui("Расчёт после въезда требует проверки — выберите период заново", "The entry calculation requires review — select the period again") : ({
    NOT_SELECTED: ui("Период не выбран", "No period selected"), CLEARED: ui("Расчёт очищен", "Estimate cleared"),
    BASE_REQUIRED: ui("Сначала нужна дата въезда или действующего окончания", "Entry or current expiry date is required first"),
    RECALC_REQUIRED: ui("Базовая дата изменилась — выберите период заново", "The base date changed — select the period again"),
    INVALID_SNAPSHOT: ui("Сохранённый расчёт требует проверки", "The saved estimate requires review"),
    REVIEW_REQUIRED: ui("Дело или тип визы требует проверки", "The case or visa type requires review"),
  }[state ?? "NOT_SELECTED"] ?? ui("Расчёт требует проверки", "Estimate requires review"));
  return <section className="crm-stay-period" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{ui("Расчёт срока", "Stay-period calculation")}</h3>
    <p id={`${id}-help`} className="crm-stay-note">{ui("Предварительный расчёт — не подтверждённый срок пребывания. Подтверждённая дата документа выше имеет приоритет; расчёт не меняет её и не подтверждает продление.", "A provisional estimate is not a confirmed stay period. The confirmed document date above takes priority; calculating does not change it or confirm an extension.")}</p>
    <div className="crm-stay-results">
      {(["INITIAL", "EXTENSION"] as const).map(purpose => {
        const slot = item.stay_estimates?.[purpose === "INITIAL" ? "initial" : "extension"];
        const savedReady = readyAdminStayEstimate(slot, purpose);
        const base = purpose === "INITIAL" ? item.entered_on : item.stay_end;
        const baseChanged = savedReady && savedReady.base !== base;
        const ready = !terminal && !baseChanged ? savedReady : null;
        const rule = savedAdminStayRule(slot, purpose);
        return <div className="crm-date-preview" key={purpose}>
          <div className="crm-date-preview-copy"><strong>{title(purpose)} · {ui("предварительно", "provisional")}</strong>
            {ready ? <><span>{ui("Расчёт до", "Estimated until")} <time dateTime={ready.end}>{formatLifeDate(ready.end, locale)}</time></span><small>{ui("От даты", "From")} {formatLifeDate(ready.base, locale)}</small></> : <span>{stateCopy(terminal && slot?.state !== "CLEARED" && slot?.state !== "NOT_SELECTED" ? "REVIEW_REQUIRED" : baseChanged ? "RECALC_REQUIRED" : slot?.state, slot?.review_reason)}</span>}
            {rule && <small>{ui("Сохранённый период", "Saved period")}: {rule.duration} {({ day: ui("дн.", "day(s)"), month: ui("календ. мес.", "calendar month(s)"), year: ui("календ. лет", "calendar year(s)") })[rule.unit]}
              {" · "}{rule.counting_policy === "base_included" ? ui("день въезда включён", "entry day included") : purpose === "INITIAL" ? ui("после даты въезда", "after the entry date") : ui("после действующего окончания", "after the current expiry")}
              {rule.unit !== "day" && <> · {rule.month_end_policy === "clamp" ? ui("край месяца: последний день", "month end: last day") : ui("край месяца: проверка", "month end: review")}</>}
            </small>}
          </div>
          <AdminServiceCountdown start={ready?.base ?? null} end={ready?.end ?? null} today={today} locale={locale} estimated
            emptyLabel={ui("Нет расчёта", "No estimate")} />
        </div>;
      })}
    </div>
    <fieldset disabled={disabled || unavailableType} aria-describedby={`${id}-help`}>
      <legend>{ui("Выбор периода для этой визы", "Choose a period for this visa")}</legend>
      <div className="crm-editor-grid">
        <label>{ui("Какой срок", "Period purpose")}<select value={draft.purpose} onChange={event => onChange(newAdminStaySelection(item, event.target.value as StayPurpose))}>
          <option value="INITIAL">{title("INITIAL")}</option><option value="EXTENSION">{title("EXTENSION")}</option>
        </select></label>
        <label>{ui("Изменение расчёта", "Estimate change")}<select value={draft.action} onChange={event => update({ action: event.target.value as AdminStaySelectionDraft["action"] })}>
          <option value="KEEP">{ui("Без изменений", "Keep saved estimate")}</option>
          <option value="SELECT" disabled={needsReview || terminal}>{ui("Выбрать период", "Select a period")}</option>
          <option value="CLEAR" disabled={needsReview}>{ui("Очистить только расчёт", "Clear the estimate only")}</option>
        </select></label>
      </div>
      {!bindingCurrent && <div className="crm-stay-fields"><p className="admin-risk">{ui("Карточка изменилась. Выберите срок заново, прежде чем сохранять расчёт.", "The case changed. Select the period again before saving an estimate.")}</p><button type="button" className="button secondary" onClick={() => onChange(newAdminStaySelection(item, draft.purpose))}>{ui("Перевыбрать период для текущей карточки", "Reselect period for the current case")}</button></div>}
      {needsReview && <p className="admin-risk">{ui("Этот сохранённый расчёт нельзя изменить или очистить до проверки его исходных данных.", "This saved estimate cannot be changed or cleared until its underlying data is reviewed.")}</p>}
      {terminal && !needsReview && <p className="admin-risk">{ui("Для завершённого дела новый расчёт недоступен. Существующий расчёт можно очистить, не меняя документы.", "A completed case cannot receive a new estimate. Its existing estimate can be cleared without changing documents.")}</p>}
      {preset && !needsReview && !terminal && bindingCurrent && <div className="crm-stay-fields">
        <button type="button" className="button secondary" onClick={() => {
          const next = presetAdminStaySelection(item, draft.purpose); if (next) onChange(next);
        }}>{preset.code}: {preset.days} {ui("дней · предварительно", "days · provisional")}</button>
        <p className="crm-stay-note">{ui("Подсказка для выбранного этапа, не общий срок действия многократной визы. Проверьте документ, способ счёта, право на продление и оставшийся общий лимит; кнопка не подтверждает их автоматически.", "This hint is for the selected stage, not the overall validity of a multiple-entry visa. Check the document, counting policy, extension eligibility and remaining total limit; the button does not confirm them automatically.")}</p>
      </div>}
      {draft.action === "SELECT" && <div className="crm-stay-fields">
        <div className="crm-editor-grid">
          <label>{ui("Количество", "Duration")}<input type="number" inputMode="numeric" min="1" step="1" value={draft.duration} onChange={event => update({ duration: event.target.value })} /></label>
          <label>{ui("Единица срока", "Duration unit")}<select value={draft.unit} onChange={event => update({ unit: event.target.value as AdminStaySelectionDraft["unit"], monthEnd: "" })}>
            <option value="day">{ui("Дни", "Days")}</option><option value="month">{ui("Календарные месяцы", "Calendar months")}</option><option value="year">{ui("Календарные годы", "Calendar years")}</option>
          </select></label>
          <label>{ui("Как считать начальную дату", "How to count the base date")}<select value={draft.counting} onChange={event => update({ counting: event.target.value as AdminStaySelectionDraft["counting"] })}>
            <option value="">{ui("Выберите явно", "Choose explicitly")}</option>
            {draft.purpose === "INITIAL" && <option value="base_included">{ui("Включать день въезда", "Include the entry day")}</option>}
            <option value="base_excluded">{draft.purpose === "INITIAL" ? ui("Добавлять срок после даты въезда", "Add the period after the entry date") : ui("Добавлять после действующего окончания", "Add after the current expiry")}</option>
          </select></label>
          {draft.unit !== "day" && <label>{ui("Если такого дня в месяце нет", "If the target month has no such day")}<select value={draft.monthEnd} onChange={event => update({ monthEnd: event.target.value as AdminStaySelectionDraft["monthEnd"] })}>
            <option value="">{ui("Выберите явно", "Choose explicitly")}</option><option value="clamp">{ui("Последний день месяца", "Use the last day of the month")}</option><option value="reject">{ui("Остановить расчёт для проверки", "Stop calculation for review")}</option>
          </select></label>}
          <label>{ui("Правило действует с", "Rule effective from")}<input type="date" value={draft.effectiveFrom} onChange={event => update({ effectiveFrom: event.target.value })} /></label>
          <label>{ui("Правило действует до · необязательно", "Rule effective until · optional")}<input type="date" value={draft.effectiveUntil} onChange={event => update({ effectiveUntil: event.target.value })} /></label>
        </div>
        <label className="crm-stay-ack"><input type="checkbox" checked={draft.acknowledged} onChange={event => onChange({ ...draft, acknowledged: event.target.checked })} />
          <span>{ui("Я проверил выбранный период и способ счёта. Это предварительная настройка администратора, не подтверждение даты документа.", "I checked the selected period and counting policy. This is an administrator's provisional setting, not confirmation of the document date.")}</span>
        </label>
        <p className="crm-stay-note">{ui("Результат рассчитает сервер при сохранении. Если дата въезда ещё не записана, период сохранится без придуманной даты окончания. Календарный год не приравнивается к 365 дням.", "The server calculates the result on Save. If entry is not yet recorded, the period is saved without inventing an expiry. A calendar year is not treated as 365 days.")}</p>
      </div>}
      {draft.action === "CLEAR" && <p className="crm-stay-note">{ui("После сохранения будет очищен только выбранный предварительный расчёт. Даты документа и история сохраняются.", "Saving clears only the selected provisional estimate. Document dates and history are preserved.")}</p>}
    </fieldset>
    {unavailableType && <p className="admin-risk">{ui("Нет точной версии типа визы. Обновите карточку; период по названию не подставляется.", "The exact visa-type version is missing. Refresh the case; no period is inferred from its name.")}</p>}
  </section>;
}
