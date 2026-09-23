import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ApiError, appApiClient } from "../api/client";
import { emptyLifeDraft, formatLifeDate, lifeCopy, lifeDateLabel, lifeDraftFromRecord, lifeWriteFields, validateLifeDraft, type AdminLifeService, type LifeDraft, type LifeErrors, type LifeKind, type LifeLocale, type LifePublication } from "./lifeServices";
import "./life-services.css";
import { changeRentalMode } from "./life-editor";

type Props = { userId: number; csrfToken: string; locale: LifeLocale };
const bikeModels = ["Yamaha NMAX", "Yamaha XMAX", "Honda PCX"];
const rentalCopy = {
  ru: { type: "Тип жилья", unspecified: "Не указан", guesthouse: "Гестхаус", hotel: "Отель", apartment: "Апартаменты", villa: "Вилла", mode: "Срок аренды", fixed: "На срок", monthly: "Помесячно", openEnded: "Без даты окончания. Оплата помесячно, без автоматического списания.", quantity: "Количество байков", monthlyPrice: "Согласованная стоимость в месяц", totalPriceHint: "Общая стоимость за все указанные байки, не за одну штуку.", required: "Для публикации нужны название и дата начала аренды; дата окончания нужна только для аренды на срок. Для страховки нужна дата окончания полиса." },
  en: { type: "Housing type", unspecified: "Not specified", guesthouse: "Guesthouse", hotel: "Hotel", apartment: "Apartment", villa: "Villa", mode: "Rental term", fixed: "Fixed term", monthly: "Monthly", openEnded: "No end date. Paid monthly, with no automatic charges.", quantity: "Number of bikes", monthlyPrice: "Agreed monthly price", totalPriceHint: "Total price for all listed bikes, not per bike.", required: "Publishing requires a title and rental start date; an end date is required only for fixed-term rentals. Insurance requires a policy end date." },
} as const;
const adminCopy = {
  ru: { title: "Услуги на Бали", add: "Добавить услугу", empty: "Услуг пока нет.", new: "Новая услуга", edit: "Редактирование услуги", kind: "Тип услуги", titleField: "Название жилья", bikeTitle: "Модель байка", insurer: "Страховая компания", other: "Другая модель", description: "Описание для клиента / программа страховки", url: "Ссылка на услугу", price: "Согласованная стоимость для клиента", currency: "Валюта", unit: "За что указана цена", contact: "Контакт для клиента", contactHint: "Только этот контакт будет показан клиенту.", owner: "Данные владельца — только сотрудникам", note: "Внутренняя заметка — только сотрудникам", publicHint: "Клиент увидит название, описание, ссылку, даты, указанную стоимость и контакт для клиента. Данные владельца и внутреннюю заметку видят только сотрудники.", draft: "Сохранить черновик", publish: "Сохранить и показать клиенту", update: "Сохранить изменения в кабинете", hide: "Убрать из кабинета", hideHint: "Снятие с публикации и архив скрывают запись у клиента; история сохраняется.", archive: "В архив", reset: "Сбросить изменения", close: "Закрыть редактор", pending: "Сохраняем…", saved: "Сохранено. Сообщения клиенту не отправлялись.", error: "Не удалось сохранить. Ваши изменения остались в форме.", loadError: "Не удалось загрузить услуги.", invalid: "Проверьте отмеченные поля.", conflict: "Запись изменена другим сотрудником. Ваши изменения сохранены в форме. Загрузите актуальную запись, чтобы продолжить; это заменит локальные изменения.", reload: "Загрузить актуальную запись", retry: "Повторить", uncertain: "Ответ на сохранение не получен. Повторите тот же запрос — повтор не создаст копию. До ответа поля временно заблокированы.", required: "Для публикации нужны название и дата окончания; для аренды — также дата начала.", status: { DRAFT: "Черновик", PUBLISHED: "В кабинете клиента", HIDDEN: "Скрыто", ARCHIVED: "Архив" } },
  en: { title: "Bali services", add: "Add service", empty: "No services yet.", new: "New service", edit: "Edit service", kind: "Service type", titleField: "Property name", bikeTitle: "Bike model", insurer: "Insurance company", other: "Other model", description: "Client description / insurance plan", url: "Service link", price: "Agreed price for the client", currency: "Currency", unit: "Price basis", contact: "Contact for the client", contactHint: "Only this contact will be shown to the client.", owner: "Owner details — staff only", note: "Internal note — staff only", publicHint: "The client will see the title, description, link, dates, entered price and client contact. Owner details and internal notes remain staff-only.", draft: "Save draft", publish: "Save and show to client", update: "Save changes to client account", hide: "Hide from client account", hideHint: "Hiding or archiving removes the record from the client account and preserves its history.", archive: "Archive", reset: "Reset changes", close: "Close editor", pending: "Saving…", saved: "Saved. No client messages were sent.", error: "Could not save. Your changes are still in the form.", loadError: "Could not load services.", invalid: "Check the highlighted fields.", conflict: "Another staff member changed this record. Your changes are still in the form. Load the current record to continue; this replaces your local changes.", reload: "Load current record", retry: "Retry", uncertain: "The save response was not received. Retry the same request; it will not create a copy. Fields are temporarily locked until the response arrives.", required: "Publishing requires a title and end date; rentals also require a start date.", status: { DRAFT: "Draft", PUBLISHED: "In client account", HIDDEN: "Hidden", ARCHIVED: "Archived" } },
} as const;

// Mount only for a server-authorized root administrator. The API also enforces access.
export function AdminLifeServices(props: Props) {
  return <AdminLifeContent key={props.userId} {...props} />;
}

function AdminLifeContent({ userId, csrfToken, locale }: Props) {
  const t = adminCopy[locale];
  const rental = rentalCopy[locale];
  const shared = lifeCopy[locale];
  const prefix = `/api/web/admin/clients/${userId}/life-services`;
  const [items, setItems] = useState<AdminLifeService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saved, setSaved] = useState<AdminLifeService | null>(null);
  const [draft, setDraft] = useState<LifeDraft>(emptyLifeDraft);
  const [errors, setErrors] = useState<LifeErrors>({});
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const requestController = useRef<AbortController | null>(null);
  const collectionGeneration = useRef(0);
  const createAttempt = useRef<{ body: ReturnType<typeof lifeWriteFields>; key: string } | null>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const lastEditorTrigger = useRef<HTMLButtonElement | null>(null);
  const formId = useId();

  async function load(signal?: AbortSignal) {
    if (inFlight.current) return;
    const generation = ++collectionGeneration.current;
    setLoading(true); setLoadError(false);
    try {
      const result = await appApiClient().request<{ items: AdminLifeService[] }>(prefix, { signal });
      if (mounted.current && !signal?.aborted && generation === collectionGeneration.current) setItems(result.items);
    } catch { if (mounted.current && !signal?.aborted && generation === collectionGeneration.current) setLoadError(true); }
    finally { if (mounted.current && !signal?.aborted && generation === collectionGeneration.current) setLoading(false); }
  }

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => { mounted.current = false; controller.abort(); requestController.current?.abort(); };
  }, [prefix]);
  useEffect(() => { if (editorOpen) formHeading.current?.focus(); }, [editorOpen, saved?.id]);

  function openEditor(item: AdminLifeService | null, trigger: HTMLButtonElement) {
    if (inFlight.current || uncertain || loading) return;
    lastEditorTrigger.current = trigger;
    setSaved(item); setDraft(item ? lifeDraftFromRecord(item) : emptyLifeDraft());
    createAttempt.current = null;
    setErrors({}); setMessage(""); setFailed(false); setConflict(false); setEditorOpen(true);
  }
  function reset() {
    setDraft(saved ? lifeDraftFromRecord(saved) : emptyLifeDraft(draft.kind)); setErrors({});
    if (!conflict) { setMessage(""); setFailed(false); }
  }
  function closeEditor() {
    if (pending || uncertain) return;
    setEditorOpen(false);
    requestAnimationFrame(() => (lastEditorTrigger.current?.isConnected ? lastEditorTrigger.current : addButton.current)?.focus());
  }
  function update<K extends keyof LifeDraft>(field: K, value: LifeDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function write(publication: LifePublication) {
    if (inFlight.current || conflict || loading) return;
    const validation = validateLifeDraft(draft, publication, locale);
    if (!uncertain && Object.keys(validation).length) { setErrors(validation); setFailed(true); setMessage(t.invalid); requestAnimationFrame(() => document.getElementById(`${formId}-${Object.keys(validation)[0]}`)?.focus()); return; }
    inFlight.current = true; setPending(true); setMessage(""); setFailed(false);
    collectionGeneration.current += 1;
    const controller = new AbortController(); requestController.current = controller;
    const fields = lifeWriteFields(draft, publication);
    if (!saved && !createAttempt.current) createAttempt.current = { body: fields, key: crypto.randomUUID() };
    const payload = saved ? { ...fields, expected_version: saved.version } : { ...createAttempt.current!.body, idempotency_key: createAttempt.current!.key };
    try {
      const result = await appApiClient().request<AdminLifeService>(saved ? `${prefix}/${saved.id}` : prefix, { method: saved ? "PUT" : "POST", signal: controller.signal, headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
      if (!mounted.current) return;
      setItems((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      setSaved(result); setDraft(lifeDraftFromRecord(result)); setErrors({}); setMessage(t.saved); setConflict(false); setUncertain(false); createAttempt.current = null;
    } catch (error) {
      if (!mounted.current) return;
      setFailed(true);
      if (!saved && uncertain) { setMessage(t.uncertain); }
      else if (error instanceof ApiError && error.status === 409) { setConflict(true); setMessage(t.conflict); }
      else if (!saved && (!(error instanceof ApiError) || error.kind === "network" || error.kind === "invalid_response" || (error.status ?? 0) >= 500)) { setUncertain(true); setMessage(t.uncertain); }
      else {
        createAttempt.current = null; setMessage(t.error);
        if (error instanceof ApiError && error.details && typeof error.details === "object" && "detail" in error.details) {
          const detail = error.details.detail;
          if (Array.isArray(detail)) {
            const fieldErrors: LifeErrors = {};
            for (const item of detail) {
              const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] as keyof LifeDraft : null;
              if (field && field in draft) fieldErrors[field] = locale === "ru" ? "Проверьте значение поля." : "Check this field's value.";
            }
            setErrors(fieldErrors);
          }
        }
      }
    } finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }

  async function reloadRecord() {
    if (!saved || inFlight.current) return;
    inFlight.current = true; setPending(true);
    try {
      const result = await appApiClient().request<AdminLifeService>(`${prefix}/${saved.id}`);
      if (!mounted.current) return;
      setSaved(result); setDraft(lifeDraftFromRecord(result)); setItems((current) => current.map((item) => item.id === result.id ? result : item)); setConflict(false); setErrors({}); setMessage(""); setFailed(false);
    } catch { if (mounted.current) { setMessage(t.loadError); setFailed(true); } }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }

  const locked = pending || uncertain || loading;
  const field = (name: keyof LifeDraft, label: string, input: ReactNode, hint?: string) => <div className="life-field" key={name}><label htmlFor={`${formId}-${name}`}>{label}</label>{input}{hint && <small>{hint}</small>}{errors[name] && <small id={`${formId}-${name}-error`} className="life-field-error">{errors[name]}</small>}</div>;
  const attrs = (name: keyof LifeDraft) => ({ id: `${formId}-${name}`, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `${formId}-${name}-error` : undefined, disabled: locked });

  return <section className="admin-life" aria-labelledby={`${formId}-section-title`}>
    <div className="life-toolbar"><h2 id={`${formId}-section-title`}>{t.title}</h2><button ref={addButton} className="button secondary" type="button" disabled={locked} onClick={(event) => openEditor(null, event.currentTarget)}>+ {t.add}</button></div>
    {loading && <p role="status">{shared.loading}</p>}
    {loadError && <div role="alert"><p>{t.loadError}</p><button type="button" className="button secondary" disabled={locked} onClick={() => void load()}>{t.retry}</button></div>}
    {!loading && !loadError && !items.length && <p>{t.empty}</p>}
    <div className="admin-life-list">{items.map((item) => <button type="button" key={item.id} disabled={locked} onClick={(event) => openEditor(item, event.currentTarget)}><span><strong>{item.title || shared[item.kind]}</strong><small>{shared[item.kind]} · {t.status[item.publication_status]}</small></span>{item.rental_mode === "monthly" && !item.end_date ? <span>{rental.monthly}</span> : <time dateTime={item.end_date ?? undefined}>{formatLifeDate(item.end_date, locale)}</time>}</button>)}</div>
    {editorOpen && <form className="admin-life-editor" noValidate aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void write(saved?.publication_status === "PUBLISHED" ? "PUBLISHED" : "DRAFT"); }}>
      <div className="life-toolbar"><h3 ref={formHeading} tabIndex={-1}>{saved ? t.edit : t.new}</h3><button type="button" className="life-text-action" disabled={locked} onClick={closeEditor}>{t.close}</button></div>
      <p>{rental.required}</p>
      <div className="life-form-grid">
        {field("kind", t.kind, <select {...attrs("kind")} value={draft.kind} onChange={(event) => { const kind = event.target.value as LifeKind; setDraft((current) => ({ ...current, kind, rental_mode: "fixed", housing_type: null, quantity: 1, price_unit: kind === "insurance" ? "policy" : "period" })); setErrors({}); }}>{(["housing", "bike", "insurance"] as const).map((kind) => <option key={kind} value={kind}>{shared[kind]}</option>)}</select>)}
        {draft.kind === "housing" && field("housing_type", rental.type, <select {...attrs("housing_type")} value={draft.housing_type ?? ""} onChange={(event) => update("housing_type", (event.target.value || null) as LifeDraft["housing_type"])}><option value="">{rental.unspecified}</option>{(["guesthouse", "hotel", "apartment", "villa"] as const).map((type) => <option key={type} value={type}>{rental[type]}</option>)}</select>)}
        {draft.kind === "bike" && <div className="life-field"><label htmlFor={`${formId}-model`}>{t.bikeTitle}</label><select id={`${formId}-model`} disabled={locked} value={bikeModels.includes(draft.title) ? draft.title : "other"} onChange={(event) => update("title", event.target.value === "other" ? "" : event.target.value)}>{bikeModels.map((model) => <option key={model}>{model}</option>)}<option value="other">{t.other}</option></select></div>}
        {field("title", draft.kind === "housing" ? t.titleField : draft.kind === "bike" ? t.bikeTitle : t.insurer, <input {...attrs("title")} value={draft.title} maxLength={200} onChange={(event) => update("title", event.target.value)} />)}
        {draft.kind === "bike" && field("quantity", rental.quantity, <input {...attrs("quantity")} type="number" inputMode="numeric" min={1} step={1} value={draft.quantity || ""} onChange={(event) => update("quantity", event.target.value === "" ? 0 : Number(event.target.value))} />)}
        {draft.kind !== "insurance" && <fieldset className="life-field" id={`${formId}-rental_mode`} tabIndex={-1} aria-describedby={errors.rental_mode ? `${formId}-rental_mode-error` : undefined}><legend>{rental.mode}</legend><div className="life-editor-actions">{(["fixed", "monthly"] as const).map((mode) => <button className="button secondary" type="button" key={mode} disabled={locked} aria-pressed={draft.rental_mode === mode} onClick={() => { setDraft((current) => changeRentalMode(current, mode)); setErrors((current) => ({ ...current, end_date: undefined, rental_mode: undefined })); }}>{rental[mode]}</button>)}</div>{errors.rental_mode && <small id={`${formId}-rental_mode-error`} className="life-field-error">{errors.rental_mode}</small>}</fieldset>}
        {field("start_date", lifeDateLabel(draft.kind, "start", locale), <input {...attrs("start_date")} type="date" value={draft.start_date ?? ""} onChange={(event) => update("start_date", event.target.value)} />)}
        {draft.kind !== "insurance" && draft.rental_mode === "monthly" && !draft.end_date ? <p className="life-field">{rental.openEnded}</p> : field("end_date", lifeDateLabel(draft.kind, "end", locale), <input {...attrs("end_date")} type="date" value={draft.end_date ?? ""} onChange={(event) => update("end_date", event.target.value)} />)}
        {field("price_amount", draft.rental_mode === "monthly" && draft.price_unit === "month" ? rental.monthlyPrice : t.price, <input {...attrs("price_amount")} inputMode="decimal" value={draft.price_amount ?? ""} placeholder="2500000.00" onChange={(event) => update("price_amount", event.target.value)} />, draft.kind === "bike" ? rental.totalPriceHint : undefined)}
        {field("price_currency", t.currency, <select {...attrs("price_currency")} value={draft.price_currency} onChange={(event) => update("price_currency", event.target.value as LifeDraft["price_currency"])}>{["IDR", "USD", "USDT", "RUB"].map((currency) => <option key={currency}>{currency}</option>)}</select>)}
        {field("price_unit", t.unit, <select {...attrs("price_unit")} disabled={locked || (draft.rental_mode === "monthly" && draft.price_unit === "month")} value={draft.price_unit} onChange={(event) => update("price_unit", event.target.value as LifeDraft["price_unit"])}>{(draft.kind === "insurance" ? ["policy", "period"] as const : ["period", "month", "day"] as const).map((unit) => <option key={unit} value={unit}>{shared[unit]}</option>)}</select>)}
      </div>
      {field("description", t.description, <textarea {...attrs("description")} rows={3} maxLength={5000} value={draft.description ?? ""} onChange={(event) => update("description", event.target.value)} />)}
      {field("link_url", t.url, <input {...attrs("link_url")} type="url" maxLength={2000} value={draft.link_url ?? ""} placeholder="https://" onChange={(event) => update("link_url", event.target.value)} />)}
      {field("public_contact", t.contact, <input {...attrs("public_contact")} maxLength={1000} value={draft.public_contact ?? ""} onChange={(event) => update("public_contact", event.target.value)} />, t.contactHint)}
      {field("owner_details", t.owner, <textarea {...attrs("owner_details")} rows={2} maxLength={5000} value={draft.owner_details ?? ""} onChange={(event) => update("owner_details", event.target.value)} />)}
      {field("internal_note", t.note, <textarea {...attrs("internal_note")} rows={2} maxLength={5000} value={draft.internal_note ?? ""} onChange={(event) => update("internal_note", event.target.value)} />)}
      <p className="life-publish-hint">{t.publicHint}</p>
      {message && <p className="life-notice" role={failed ? "alert" : "status"}>{message}</p>}
      {conflict && saved && <button className="button secondary" type="button" disabled={pending} onClick={() => void reloadRecord()}>{t.reload}</button>}
      {uncertain && <button className="button primary" type="button" disabled={pending} onClick={() => void write(createAttempt.current!.body.publication_status)}>{pending ? t.pending : t.retry}</button>}
      <div className="life-editor-actions">
        <button className="button primary" type="button" disabled={locked || conflict} onClick={() => void write("PUBLISHED")}>{pending ? t.pending : saved?.publication_status === "PUBLISHED" ? t.update : t.publish}</button>
        {saved?.publication_status !== "PUBLISHED" && <button className="button secondary" type="button" disabled={locked || conflict} onClick={() => void write("DRAFT")}>{t.draft}</button>}
        <button className="life-text-action" type="button" disabled={locked} onClick={reset}>{t.reset}</button>
      </div>
      {saved && <div className="life-editor-history"><p>{t.hideHint}</p><div className="life-editor-actions">{saved.publication_status === "PUBLISHED" && <button className="button secondary" type="button" disabled={locked || conflict} onClick={() => void write("HIDDEN")}>{t.hide}</button>}{saved.publication_status !== "ARCHIVED" && <button className="life-text-action" type="button" disabled={locked || conflict} onClick={() => void write("ARCHIVED")}>{t.archive}</button>}</div></div>}
    </form>}
  </section>;
}
