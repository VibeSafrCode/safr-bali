import { useEffect, useRef, useState } from "react";
import { apiErrorMessage, appApiClient } from "../api/client";
import { VisaStatusHelp } from "./VisaStatusHelp";

type Client = { id: number; username?: string; first_name?: string; last_name?: string; telegram_id_mask: string; email?: string; bot_status: string; tags: string[]; active_visa_count: number; requires_attention: boolean };
type VisaType = { id: number; code: string; name: string; version: number; rules_verified: boolean };
type ProcessDraft = { id?: number; process_type: string; external_status: string; reference?: string; action?: "UPSERT" | "REMOVE" };
type Case = { id: number; user_id: number; country_code: string; custom_visa_name?: string; visa_type: { code: string; name: string }; service_status: string; lifecycle_status: string; publication_status: string; notifications_enabled?: boolean; entry_deadline?: string; stay_end?: string; date_source?: string; next_action_text?: string; recommended_contact_at?: string; version: number; processes?: Array<{ id: number; type: string; external_status: string }> };
type Dialogue = { id: number | null; status: string; messages: Array<{ id: number; author_type: string; body: string; visibility: string; created_at: string; delivery_status?: string }> };
type ClientDetail = { client: Client; visa_cases: Case[]; notes: Array<{ id: number; body: string; pinned: boolean }>; credentials: Array<{ id: number; provider: string; login_mask?: string }>; dialogue: Dialogue };

const dialogueCopy = {
  ru: { title: "Диалог с клиентом", empty: "Сообщений пока нет.", loading: "Загружаем диалог…", failed: "Не удалось загрузить диалог.", retry: "Повторить", retryDelivery: "Повторить отправку", retryingDelivery: "Повторяем отправку…", retrySuccess: "Повторная доставка поставлена в очередь без дубликата.", retryError: "Не удалось повторить доставку. Попробуйте ещё раз.", client: "Клиент", staff: "Менеджер", queued: "в очереди", delivered: "доставлено", deliveryFailed: "ошибка доставки", privacy: "Не отправляйте паспортные данные или файлы в Telegram. Используйте защищённые документы кабинета.", label: "Сообщение клиенту через Telegram", sending: "Отправляем…", send: "Отправить клиенту", pending: "Сообщение отправляется…", success: "Сообщение поставлено в защищённую очередь Telegram один раз.", error: "Не удалось отправить сообщение. Повторите попытку." },
  en: { title: "Client dialogue", empty: "No messages yet.", loading: "Loading dialogue…", failed: "Could not load the dialogue.", retry: "Retry", retryDelivery: "Retry delivery", retryingDelivery: "Retrying delivery…", retrySuccess: "Delivery was requeued without creating a duplicate.", retryError: "Could not retry delivery. Please try again.", client: "Client", staff: "Manager", queued: "queued", delivered: "delivered", deliveryFailed: "delivery failed", privacy: "Do not send passport details or files in Telegram. Use protected cabinet documents.", label: "Message the client via Telegram", sending: "Sending…", send: "Send to client", pending: "Message is being sent…", success: "Message was queued for protected Telegram delivery once.", error: "Could not send the message. Please try again." },
} as const;

function adminHeaders(csrf: string) { return { "Content-Type": "application/json", "X-CSRF-Token": csrf }; }

function Dialog({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const focusable = () => [...(root?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]') ?? [])];
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
      if (dialogs.at(-1) !== root) return;
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const nodes = focusable(); if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  return <div ref={ref} className="admin-overlay" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</div>;
}

const statusDescriptions = {
  ru: {
    PURCHASED: "Услуга оформлена в SAFRWAY; работа ещё не отправлена во внешнюю систему.", DOCUMENTS_REQUIRED: "SAFRWAY ожидает документы от клиента.", DOCUMENTS_RECEIVED: "Документы получены и готовятся к следующему шагу.", SUBMITTED: "Заявка отмечена как поданная.", WAITING_PAYMENT: "Процесс ожидает подтверждения оплаты.", PAID: "Оплата подтверждена в рабочем процессе.", PROCESSING: "SAFRWAY продолжает обработку кейса.", ACTION_REQUIRED: "Для продолжения требуется действие клиента или менеджера.", COMPLETED: "Работа SAFRWAY по услуге завершена.", CANCELLED: "Работа по услуге остановлена.",
    NOT_ISSUED: "В системе SAFRWAY нет подтверждения выдачи визы.", ISSUED_NOT_ACTIVATED: "Выдача подтверждена, активация не отмечена.", ACTIVE: "Виза отмечена активной по подтверждённым менеджером данным.", EXPIRING: "Кейс отмечен как приближающийся к завершению срока по подтверждённым данным.", EXTENSION_PROCESSING: "В SAFRWAY отмечена обработка продления.", EXTENDED: "Продление отмечено завершённым по подтверждённым данным.", EXPIRED: "В системе срок отмечен завершившимся.", REFUSED: "В системе зафиксирован отказ.",
    UNKNOWN: "Внешний статус ещё не подтверждён.", BIOMETRICS_REQUIRED: "Во внешнем процессе отмечено требование биометрии.", APPROVED: "Во внешнем процессе отмечено одобрение.", REJECTED: "Во внешнем процессе отмечено отклонение.",
  },
  en: {
    PURCHASED: "The SAFRWAY service is registered; it has not yet been submitted externally.", DOCUMENTS_REQUIRED: "SAFRWAY is waiting for client documents.", DOCUMENTS_RECEIVED: "Documents were received and are being prepared for the next step.", SUBMITTED: "The application is recorded as submitted.", WAITING_PAYMENT: "The workflow is waiting for payment confirmation.", PAID: "Payment is confirmed in the workflow.", PROCESSING: "SAFRWAY is processing the case.", ACTION_REQUIRED: "A client or manager action is required.", COMPLETED: "SAFRWAY work on the service is complete.", CANCELLED: "Work on the service is stopped.",
    NOT_ISSUED: "SAFRWAY has no confirmed visa issuance record.", ISSUED_NOT_ACTIVATED: "Issuance is confirmed; activation is not recorded.", ACTIVE: "The visa is recorded as active from manager-confirmed data.", EXPIRING: "The case is marked as approaching its confirmed end date.", EXTENSION_PROCESSING: "SAFRWAY records an extension in progress.", EXTENDED: "The extension is recorded as completed from confirmed data.", EXPIRED: "The recorded validity period has ended.", REFUSED: "A refusal is recorded in the system.",
    UNKNOWN: "The external status is not confirmed yet.", BIOMETRICS_REQUIRED: "The external process records a biometrics requirement.", APPROVED: "The external process records approval.", REJECTED: "The external process records rejection.",
  },
} as const;

const serviceTransitions: Record<string, string[]> = { PURCHASED: ["DOCUMENTS_REQUIRED","CANCELLED"], DOCUMENTS_REQUIRED: ["DOCUMENTS_RECEIVED","CANCELLED"], DOCUMENTS_RECEIVED: ["SUBMITTED","WAITING_PAYMENT","CANCELLED"], SUBMITTED: ["WAITING_PAYMENT","PAID","PROCESSING","ACTION_REQUIRED","CANCELLED"], WAITING_PAYMENT: ["PAID","CANCELLED"], PAID: ["PROCESSING","CANCELLED"], PROCESSING: ["ACTION_REQUIRED","COMPLETED","CANCELLED"], ACTION_REQUIRED: ["PROCESSING","COMPLETED","CANCELLED"], COMPLETED: [], CANCELLED: [] };
const lifecycleTransitions: Record<string, string[]> = { NOT_ISSUED: ["ISSUED_NOT_ACTIVATED","CANCELLED","REFUSED"], ISSUED_NOT_ACTIVATED: ["ACTIVE","CANCELLED","REFUSED"], ACTIVE: ["EXPIRING","EXTENSION_PROCESSING","EXPIRED","CANCELLED"], EXPIRING: ["EXTENSION_PROCESSING","EXTENDED","EXPIRED","CANCELLED"], EXTENSION_PROCESSING: ["EXTENDED","ACTIVE","EXPIRED","CANCELLED","REFUSED"], EXTENDED: ["ACTIVE","EXPIRING","EXPIRED","CANCELLED"], EXPIRED: [], CANCELLED: [], REFUSED: [] };

function StatusPicker({ label, value, current, options, transitions, locale, onChange, disabled }: { label: string; value: string; current: string; options: string[]; transitions: Record<string, string[]>; locale: "ru" | "en"; onChange: (value: string) => void; disabled: boolean }) {
  return <fieldset className="crm-status-picker" disabled={disabled}><legend>{label}</legend><div role="radiogroup" aria-label={label}>{options.map((code) => {
    const description = statusDescriptions[locale][code as keyof typeof statusDescriptions.ru] ?? (locale === "ru" ? "Системный статус без дополнительного юридического толкования." : "A system status without additional legal interpretation.");
    const descriptionId = `${label.replaceAll(" ", "-")}-${code}-help`;
    const unavailable = code !== current && !(transitions[current] ?? []).includes(code);
    const reason = locale === "ru" ? `Переход из ${current} в ${code} недоступен.` : `Transition from ${current} to ${code} is unavailable.`;
    return <label key={code} className={`crm-status-option${unavailable ? " is-disabled" : ""}`} title={unavailable ? reason : description}><input type="radio" name={label} value={code} checked={value === code} disabled={unavailable} onChange={() => onChange(code)} aria-describedby={descriptionId} /><strong>{code}</strong><span id={descriptionId}>{unavailable ? `${description} ${reason}` : description}</span></label>;
  })}</div><small>{locale === "ru" ? "Описание отражает только рабочее состояние SAFRWAY и не является юридической консультацией." : "Descriptions reflect SAFRWAY workflow only and are not legal advice."}</small></fieldset>;
}

export function AdminVisaCRM({ csrfToken, initialClientId, locale = "ru" }: { csrfToken: string; initialClientId?: number | null; locale?: "ru" | "en" }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [types, setTypes] = useState<VisaType[]>([]);
  const [selected, setSelected] = useState<ClientDetail | null>(null);
  const [search, setSearch] = useState("");
  const [visaFilter, setVisaFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [visaTypeId, setVisaTypeId] = useState("");
  const [customName, setCustomName] = useState("");
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [serviceStatus, setServiceStatus] = useState("PURCHASED");
  const [lifecycleStatus, setLifecycleStatus] = useState("NOT_ISSUED");
  const [entryDeadline, setEntryDeadline] = useState("");
  const [stayEnd, setStayEnd] = useState("");
  const [dateSource, setDateSource] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [recommendedContact, setRecommendedContact] = useState("");
  const [credentialProvider, setCredentialProvider] = useState("");
  const [credentialLogin, setCredentialLogin] = useState("");
  const [credentialSecret, setCredentialSecret] = useState("");
  const [revealedCredential, setRevealedCredential] = useState<{ id: number; login?: string; secret: string } | null>(null);
  const [processes, setProcesses] = useState<ProcessDraft[]>([]);
  const [submitting, setSubmitting] = useState("");
  const [publicationConfirm, setPublicationConfirm] = useState<"publish" | "hide" | "archive" | null>(null);
  const [saveNotifyConfirm, setSaveNotifyConfirm] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [managerMessage, setManagerMessage] = useState("");
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");
  const [pendingClientId, setPendingClientId] = useState<number | null>(null);
  const messageFieldRef = useRef<HTMLTextAreaElement>(null);
  const messageNodeRefs = useRef(new Map<number, HTMLLIElement>());
  const dialogueLogRef = useRef<HTMLOListElement>(null);
  const dialogueLocale = locale;
  const chat = dialogueCopy[dialogueLocale];

  useEffect(() => {
    if (!selected) return;
    const frame = window.requestAnimationFrame(() => messageFieldRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.client.id]);

  useEffect(() => {
    if (!selected) return;
    const frame = window.requestAnimationFrame(() => {
      const log = dialogueLogRef.current;
      if (log) log.scrollTop = log.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.dialogue?.messages?.length]);

  useEffect(() => {
    if (!revealedCredential) return;
    const timer = window.setTimeout(() => { setRevealedCredential(null); setFeedback("Доступ автоматически скрыт."); }, 20_000);
    return () => window.clearTimeout(timer);
  }, [revealedCredential]);

  async function loadClients(query = search) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      if (visaFilter) params.set("visa_filter", visaFilter);
      const suffix = params.size ? `?${params}` : "";
      const [clientData, typeData] = await Promise.all([
        appApiClient().request<{ items: Client[] }>(`/api/web/admin/clients${suffix}`),
        appApiClient().request<{ items: VisaType[] }>("/api/web/admin/visa-cases/types"),
      ]);
      setClients(clientData.items); setTypes(typeData.items);
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setLoading(false); }
  }

  async function openClient(id: number) {
    setPendingClientId(id); setDetailState("loading"); setError("");
    try {
      setSelected(await appApiClient().request<ClientDetail>(`/api/web/admin/clients/${id}`));
      setDetailState("idle");
    }
    catch { setSelected(null); setDetailState("error"); }
  }

  useEffect(() => { void loadClients(""); }, []);
  useEffect(() => { if (initialClientId) void openClient(initialClientId); }, [initialClientId]);

  async function createCase(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !visaTypeId) return;
    try {
      const type = types.find((item) => item.id === Number(visaTypeId));
      if (type?.code === "OTHER" && !customName.trim()) { setError("Для варианта Other Visa укажите ручное название."); return; }
      await appApiClient().request("/api/web/admin/visa-cases", { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ user_id: selected.client.id, visa_type_id: Number(visaTypeId), country_code: "ID", custom_visa_name: type?.code === "OTHER" ? customName.trim() : null, service_type: "APPLICATION", reason: "Manual admin case creation" }) });
      setCreateOpen(false); setCustomName(""); await openClient(selected.client.id);
    } catch (caught) { setError(apiErrorMessage(caught)); }
  }

  async function addNote(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !note.trim()) return;
    try {
      await appApiClient().request(`/api/web/admin/clients/${selected.client.id}/notes`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ body: note, pinned: false }) });
      setNote(""); await openClient(selected.client.id);
    } catch (caught) { setError(apiErrorMessage(caught)); }
  }

  async function addTag(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !tag.trim()) return;
    try { await appApiClient().request(`/api/web/admin/clients/${selected.client.id}/tags`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ name: tag.trim() }) }); setTag(""); await loadClients(); }
    catch (caught) { setError(apiErrorMessage(caught)); }
  }

  async function sendManagerMessage(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !managerMessage.trim() || submitting) return;
    setSubmitting("manager-message"); setError(""); setFeedback(chat.pending);
    try {
      await appApiClient().request(`/api/web/admin/clients/${selected.client.id}/messages`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ body: managerMessage.trim(), idempotency_key: crypto.randomUUID() }) });
      setManagerMessage(""); setFeedback(chat.success); await openClient(selected.client.id);
    } catch { setFeedback(""); setError(chat.error); }
    finally { setSubmitting(""); window.setTimeout(() => messageFieldRef.current?.focus(), 0); }
  }

  async function retryDelivery(messageId: number) {
    if (!selected || submitting) return;
    setSubmitting(`retry-${messageId}`); setError(""); setFeedback(chat.retryingDelivery);
    try {
      await appApiClient().request(`/api/web/admin/clients/${selected.client.id}/messages/${messageId}/retry`, { method: "POST", headers: adminHeaders(csrfToken) });
      setFeedback(chat.retrySuccess); await openClient(selected.client.id);
    } catch { setFeedback(""); setError(chat.retryError); }
    finally {
      setSubmitting("");
      window.setTimeout(() => messageNodeRefs.current.get(messageId)?.focus(), 0);
    }
  }

  function editCase(item: Case) {
    setSelectedCase(item); setServiceStatus(item.service_status); setLifecycleStatus(item.lifecycle_status);
    setNextAction(item.next_action_text ?? ""); setRecommendedContact(item.recommended_contact_at?.slice(0, 10) ?? "");
    setEntryDeadline(item.entry_deadline?.slice(0, 10) ?? ""); setStayEnd(item.stay_end?.slice(0, 10) ?? ""); setDateSource(item.date_source ?? "");
    setProcesses((item.processes ?? []).map((process) => ({ id: process.id, process_type: process.type, external_status: process.external_status, action: "UPSERT" })));
  }

  async function saveCase(event: React.FormEvent | null, notifyClient = false) {
    event?.preventDefault(); if (!selected || !selectedCase || submitting) return;
    const body: Record<string, unknown> = { service_status: serviceStatus, lifecycle_status: lifecycleStatus, next_action_text: nextAction || null, recommended_contact_at: recommendedContact ? `${recommendedContact}T00:00:00+08:00` : null, processes, reason: "Manual root-admin aggregate update", expected_version: selectedCase.version, notify_client: notifyClient, idempotency_key: crypto.randomUUID() };
    if (entryDeadline) body.entry_deadline = entryDeadline;
    if (stayEnd) body.stay_end = stayEnd;
    if (entryDeadline || stayEnd) body.date_source = dateSource;
    setSubmitting(notifyClient ? "save-notify" : "save"); setError("");
    try { await appApiClient().request(`/api/web/admin/visa-cases/${selectedCase.id}/aggregate`, { method: "PATCH", headers: adminHeaders(csrfToken), body: JSON.stringify(body) }); setSelectedCase(null); setFeedback(dialogueLocale === "ru" ? (notifyClient ? "Все изменения сохранены. Создано ровно одно уведомление CASE_UPDATED." : "Все изменения сохранены без уведомления клиента.") : (notifyClient ? "All changes were saved. Exactly one CASE_UPDATED notification was created." : "All changes were saved without notifying the client.")); await openClient(selected.client.id); }
    catch { setError(dialogueLocale === "ru" ? "Не удалось сохранить изменения. Ничего не было записано; проверьте поля и повторите." : "Could not save the changes. Nothing was committed; review the fields and retry."); }
    finally { setSubmitting(""); }
  }

  async function publication(action: "publish" | "hide" | "archive") {
    if (!selected || !selectedCase || submitting) return;
    setSubmitting(`publication-${action}`); setError("");
    try { await appApiClient().request(`/api/web/admin/visa-cases/${selectedCase.id}/publication/${action}`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ notify_client: action === "publish", reason: `Manual ${action}`, idempotency_key: crypto.randomUUID() }) }); setPublicationConfirm(null); setSelectedCase(null); setFeedback(action === "publish" ? "Кейс опубликован; уведомление поставлено в очередь один раз." : action === "hide" ? "Кейс скрыт от клиента." : "Кейс архивирован и скрыт от клиента."); await openClient(selected.client.id); }
    catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(""); }
  }

  async function addCredential(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !credentialProvider || !credentialSecret) return;
    try { await appApiClient().request(`/api/web/admin/clients/${selected.client.id}/credentials`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ provider: credentialProvider, login: credentialLogin || null, secret: credentialSecret }) }); setCredentialProvider(""); setCredentialLogin(""); setCredentialSecret(""); await openClient(selected.client.id); }
    catch (caught) { setError(apiErrorMessage(caught)); }
  }

  async function accessCredential(id: number, action: "REVEAL" | "COPY") {
    if (submitting) return; setSubmitting(`credential-${action.toLowerCase()}`); setFeedback(""); setError("");
    try {
      const result = await appApiClient().request<{ login?: string; secret: string }>(`/api/web/admin/visa-cases/credentials/${id}/access`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ action, reason: `Root-admin ${action.toLowerCase()}` }) });
      if (action === "COPY") { await navigator.clipboard.writeText(result.secret); setFeedback("Скопировано. Значение не показано на экране."); }
      else { setRevealedCredential({ id, ...result }); setFeedback("Доступ показан на 20 секунд."); }
    } catch { setRevealedCredential(null); setFeedback("Доступ недоступен: ключ шифрования не настроен или запрос отклонён. Секрет не раскрыт."); }
    finally { setSubmitting(""); }
  }

  function addStagedProcess() {
    setProcesses((current) => [...current, { process_type: "APPLICATION", external_status: "UNKNOWN", action: "UPSERT" }]);
  }

  function updateStagedProcess(index: number, values: Partial<ProcessDraft>) {
    setProcesses((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  }

  function removeStagedProcess(index: number) {
    setProcesses((current) => current.flatMap((item, itemIndex) => itemIndex !== index ? [item] : item.id ? [{ ...item, action: "REMOVE" as const }] : []));
  }


  if (!selected && detailState !== "idle") return <section className="admin-panel crm-client-card" aria-live="polite">
    <button className="admin-back" onClick={() => { setDetailState("idle"); setPendingClientId(null); }}>← Все клиенты</button>
    {detailState === "loading" ? <div className="admin-empty" role="status">{chat.loading}</div> : <div className="admin-empty" role="alert"><p>{chat.failed}</p><button className="button secondary" onClick={() => pendingClientId && void openClient(pendingClientId)}>{chat.retry}</button></div>}
  </section>;

  if (selected) return <section className="admin-panel crm-client-card">
    <button className="admin-back" onClick={() => setSelected(null)}>← Все клиенты</button>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {feedback && <div className={feedback.startsWith("Доступ недоступен") ? "admin-alert" : "admin-outcome"} role="status" aria-live="polite">{feedback}</div>}
    <header className="crm-client-head"><div><span className="eyebrow">SAFRWAY ID {selected.client.id}</span><h2>{[selected.client.first_name, selected.client.last_name].filter(Boolean).join(" ") || selected.client.username || "Клиент"}</h2><p>{selected.client.telegram_id_mask} · {selected.client.bot_status}</p><form className="crm-tag-form" onSubmit={addTag}><input aria-label="Новый внутренний тег" placeholder="Добавить тег" value={tag} onChange={(event) => setTag(event.target.value)} /><button disabled={!tag.trim()}>Добавить</button></form></div><button className="button primary" onClick={() => setCreateOpen(true)}>+ Добавить визу</button></header>
    <div className="crm-tabs" aria-label="Разделы карточки клиента"><span>Обзор</span><span>Визы</span><span>Документы</span><span>Доступы</span><span>История</span><span>Заметки</span></div>
    <section><h3>Визы и услуги</h3>{selected.visa_cases.length ? <div className="crm-case-list">{selected.visa_cases.map((item) => <div className="crm-case-row" key={item.id}><button type="button" onClick={() => editCase(item)}><div><strong>Индонезия · {item.custom_visa_name || item.visa_type.name}</strong><small>{item.publication_status} · v{item.version}</small></div><span>{item.lifecycle_status}</span><span>{item.next_action_text || "Следующее действие не задано"}</span></button><VisaStatusHelp kind="visa" code={item.lifecycle_status} locale="ru" /></div>)}</div> : <div className="admin-empty">Визовых кейсов пока нет.</div>}</section>
    <section className="crm-split"><div><h3>{chat.title}</h3>{selected.dialogue?.messages?.filter((item) => item.visibility === "client").length ? <ol ref={dialogueLogRef} className="chat-messages" role="log" aria-label={chat.title} aria-live="polite" aria-relevant="additions text">{selected.dialogue.messages.filter((item) => item.visibility === "client").map((item) => { const delivery = item.delivery_status === "failed" ? chat.deliveryFailed : item.delivery_status === "delivered" ? chat.delivered : chat.queued; return <li ref={(node) => { if (node) messageNodeRefs.current.set(item.id, node); else messageNodeRefs.current.delete(item.id); }} tabIndex={-1} className={item.author_type === "client" ? "chat-message from-client" : "chat-message from-staff"} key={item.id}><span>{item.author_type === "client" ? chat.client : `${chat.staff} · ${delivery}`}</span><time dateTime={item.created_at}>{new Intl.DateTimeFormat(dialogueLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time><p>{item.body}</p>{item.author_type === "staff" && item.delivery_status === "failed" && <button type="button" disabled={!!submitting} onClick={() => void retryDelivery(item.id)}>{submitting === `retry-${item.id}` ? chat.retryingDelivery : chat.retryDelivery}</button>}</li>; })}</ol> : <div className="admin-empty">{chat.empty}</div>}<form className="chat-form" onSubmit={sendManagerMessage}><p className="admin-risk">{chat.privacy}</p><label>{chat.label}<textarea ref={messageFieldRef} disabled={!!submitting} value={managerMessage} onChange={(event) => setManagerMessage(event.target.value)} /></label><button className="button primary" disabled={!managerMessage.trim() || !!submitting}>{submitting === "manager-message" ? chat.sending : chat.send}</button></form></div><div><h3>Внутренние заметки</h3>{selected.notes.map((item) => <article className="crm-note" key={item.id}>{item.pinned && <strong>Закреплено</strong>}<p>{item.body}</p></article>)}<form onSubmit={addNote}><label>Новая заметка<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label><button className="button secondary" disabled={!note.trim()}>Добавить</button></form></div></section>
    <section><h3>Защищённые доступы</h3><p className="admin-risk">Значения скрыты. Показ автоматически закроется через 20 секунд; каждое reveal/copy аудируется.</p>{selected.credentials.map((item) => <article className="crm-note" key={item.id}><strong>{item.provider}</strong><p>{revealedCredential?.id === item.id ? `${revealedCredential.login ?? ""} · ${revealedCredential.secret}` : item.login_mask || "Login скрыт"}</p><div>{revealedCredential?.id === item.id ? <button onClick={() => { setRevealedCredential(null); setFeedback("Доступ снова скрыт."); }}>Скрыть сейчас</button> : <button disabled={!!submitting} onClick={() => void accessCredential(item.id, "REVEAL")}>{submitting === "credential-reveal" ? "Открываем…" : "Показать"}</button>}<button disabled={!!submitting} onClick={() => void accessCredential(item.id, "COPY")}>{submitting === "credential-copy" ? "Копируем…" : "Копировать"}</button></div></article>)}<form onSubmit={addCredential}><label>Сервис<input value={credentialProvider} onChange={(event) => setCredentialProvider(event.target.value)} /></label><label>Login<input autoComplete="off" value={credentialLogin} onChange={(event) => setCredentialLogin(event.target.value)} /></label><label>Пароль или token<input type="password" autoComplete="new-password" value={credentialSecret} onChange={(event) => setCredentialSecret(event.target.value)} /></label><button className="button secondary" disabled={!credentialProvider || !credentialSecret}>Сохранить зашифрованно</button></form></section>
    {createOpen && <Dialog labelledBy="visa-create-title" onClose={() => setCreateOpen(false)}><form onSubmit={createCase}><span className="eyebrow">Ручной режим</span><h2 id="visa-create-title">Новая виза</h2><label>Страна<input value="Индонезия" disabled /></label><label>Тип визы<select required value={visaTypeId} onChange={(event) => setVisaTypeId(event.target.value)}><option value="">Выберите</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}{type.rules_verified ? "" : " · ручные даты"}</option>)}</select></label>{types.find((type) => type.id === Number(visaTypeId))?.code === "OTHER" && <label>Название визы<input required value={customName} onChange={(event) => setCustomName(event.target.value)} /></label>}<p>Кейс будет сохранён как черновик и не появится у клиента до явной публикации.</p><div><button type="button" onClick={() => setCreateOpen(false)}>Отмена</button><button className="button primary">Сохранить черновик</button></div></form></Dialog>}
    {selectedCase && <Dialog labelledBy="visa-edit-title" onClose={() => { if (!submitting) setSelectedCase(null); }}><form onSubmit={(event) => void saveCase(event, false)}><span className="eyebrow">{selectedCase.publication_status} · v{selectedCase.version}</span><h2 id="visa-edit-title">Редактировать визу</h2><StatusPicker label="Статус услуги" value={serviceStatus} current={selectedCase.service_status} transitions={serviceTransitions} options={["PURCHASED","DOCUMENTS_REQUIRED","DOCUMENTS_RECEIVED","SUBMITTED","WAITING_PAYMENT","PAID","PROCESSING","ACTION_REQUIRED","COMPLETED","CANCELLED"]} locale={dialogueLocale} onChange={setServiceStatus} disabled={!!submitting} /><StatusPicker label="Статус визы" value={lifecycleStatus} current={selectedCase.lifecycle_status} transitions={lifecycleTransitions} options={["NOT_ISSUED","ISSUED_NOT_ACTIVATED","ACTIVE","EXPIRING","EXTENSION_PROCESSING","EXTENDED","EXPIRED","CANCELLED","REFUSED"]} locale={dialogueLocale} onChange={setLifecycleStatus} disabled={!!submitting} /><label>Использовать до<input disabled={!!submitting} type="date" value={entryDeadline} onChange={(event) => setEntryDeadline(event.target.value)} /></label><label>Находиться до<input disabled={!!submitting} type="date" value={stayEnd} onChange={(event) => setStayEnd(event.target.value)} /></label>{(entryDeadline || stayEnd) && <label>Источник подтверждённой даты<input disabled={!!submitting} required value={dateSource} onChange={(event) => setDateSource(event.target.value)} /></label>}<label>Следующее действие<textarea disabled={!!submitting} value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></label><label>Рекомендуемая дата связи<input disabled={!!submitting} type="date" value={recommendedContact} onChange={(event) => setRecommendedContact(event.target.value)} /></label><fieldset disabled={!!submitting}><legend>Процессы — сохраняются вместе с визой</legend>{processes.map((process, index) => process.action === "REMOVE" ? <div className="crm-process-row is-removed" key={process.id ?? index}><span>{process.process_type} · {process.external_status}</span><button type="button" onClick={() => updateStagedProcess(index, { action: "UPSERT" })}>Вернуть</button></div> : <div className="crm-process-row" key={process.id ?? `new-${index}`}><label>Тип процесса<select value={process.process_type} onChange={(event) => updateStagedProcess(index, { process_type: event.target.value })}>{["APPLICATION","EXTENSION","BRIDGING","CONVERSION","RE_ENTRY","CANCELLATION"].map((item) => <option key={item}>{item}</option>)}</select></label><StatusPicker label={`Внешний статус ${index + 1}`} value={process.external_status} current={process.external_status} transitions={{ [process.external_status]: ["UNKNOWN","WAITING_PAYMENT","PAID","SUBMITTED","PROCESSING","ACTION_REQUIRED","BIOMETRICS_REQUIRED","APPROVED","REJECTED","CANCELLED"] }} options={["UNKNOWN","WAITING_PAYMENT","PAID","SUBMITTED","PROCESSING","ACTION_REQUIRED","BIOMETRICS_REQUIRED","APPROVED","REJECTED","CANCELLED"]} locale={dialogueLocale} onChange={(value) => updateStagedProcess(index, { external_status: value })} disabled={!!submitting} /><label>Reference (зашифруется)<input value={process.reference ?? ""} onChange={(event) => updateStagedProcess(index, { reference: event.target.value })} /></label><button type="button" onClick={() => removeStagedProcess(index)}>Убрать процесс</button></div>)}<button type="button" onClick={addStagedProcess}>+ Добавить процесс</button></fieldset><p className="admin-risk">Документы временно исключены из сохранения до подключения защищённой загрузки и хранилища.</p><div className="crm-publication-actions"><button disabled={!!submitting} type="button" onClick={() => setPublicationConfirm("hide")}>Скрыть</button><button disabled={!!submitting} type="button" onClick={() => setPublicationConfirm("archive")}>Архив</button><button disabled={!!submitting} type="button" onClick={() => setPublicationConfirm("publish")}>Опубликовать</button></div><div className="crm-save-actions"><button disabled={!!submitting} type="button" onClick={() => setSelectedCase(null)}>Отмена</button><button disabled={!!submitting} type="submit">{submitting === "save" ? "Сохраняем всё…" : "Сохранить"}</button><button disabled={!!submitting || selectedCase.publication_status !== "PUBLISHED" || selectedCase.notifications_enabled === false} className="button primary" type="button" onClick={() => setSaveNotifyConfirm(true)}>{submitting === "save-notify" ? "Сохраняем всё и уведомляем…" : "Сохранить и уведомить"}</button></div>{selectedCase.notifications_enabled === false && <p className="admin-risk" role="status">{dialogueLocale === "ru" ? "Уведомления клиента отключены. Сохраните изменения без уведомления." : "Client notifications are disabled. Save the changes without notification."}</p>}</form></Dialog>}
    {saveNotifyConfirm && <Dialog labelledBy="save-notify-title" onClose={() => setSaveNotifyConfirm(false)}><div><h2 id="save-notify-title">{dialogueLocale === "ru" ? "Сохранить все изменения и уведомить?" : "Save all changes and notify?"}</h2><p>{dialogueLocale === "ru" ? "Кейс и все процессы сохранятся одной транзакцией, затем будет создано ровно одно уведомление CASE_UPDATED." : "The case and all processes will be saved in one transaction, then exactly one CASE_UPDATED notification will be created."}</p><div><button type="button" disabled={!!submitting} onClick={() => setSaveNotifyConfirm(false)}>{dialogueLocale === "ru" ? "Отмена" : "Cancel"}</button><button className="button primary" type="button" disabled={!!submitting} onClick={() => { setSaveNotifyConfirm(false); void saveCase(null, true); }}>{dialogueLocale === "ru" ? "Подтвердить сохранение" : "Confirm save"}</button></div></div></Dialog>}
    {publicationConfirm && selectedCase && <Dialog labelledBy="visa-publication-title" onClose={() => { if (!submitting) setPublicationConfirm(null); }}><section><h2 id="visa-publication-title">Подтвердите действие</h2><p>{publicationConfirm === "publish" ? "Кейс станет виден клиенту. Если уведомления включены, будет создано одно уведомление о публикации." : publicationConfirm === "hide" ? "Кейс исчезнет из кабинета клиента, но останется доступен администратору." : "Кейс будет архивирован и скрыт от клиента."}</p><div><button disabled={!!submitting} onClick={() => setPublicationConfirm(null)}>Отмена</button><button disabled={!!submitting} className="button primary" onClick={() => void publication(publicationConfirm)}>{submitting ? "Выполняем…" : "Подтвердить"}</button></div></section></Dialog>}
  </section>;

  return <section className="admin-panel"><div className="admin-panel-head"><div><h2>Клиенты</h2><p>Единый профиль Telegram и browser account.</p></div><span>{clients.length} записей</span></div>{error && <div className="admin-alert" role="alert">{error}</div>}<form className="crm-search" onSubmit={(event) => { event.preventDefault(); void loadClients(); }}><label htmlFor="crm-search">Поиск по SAFRWAY ID, Telegram, имени, телефону или email</label><div><input id="crm-search" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Фильтр виз" value={visaFilter} onChange={(event) => setVisaFilter(event.target.value)}><option value="">Все клиенты</option><option value="active">Есть активная виза</option><option value="none">Нет виз</option><option value="processing">Идёт оформление</option><option value="action">Требуется действие</option><option value="notifications_off">Уведомления отключены</option><option value="archived">Архивные визы</option></select><button className="button secondary">Найти</button></div></form>{loading ? <div className="admin-empty">Загружаем клиентов…</div> : !clients.length ? <div className="admin-empty">Клиенты не найдены.</div> : <div className="admin-list">{clients.map((client) => <button className="admin-row crm-client-row" key={client.id} onClick={() => void openClient(client.id)}><div><strong>{client.first_name || client.username || `Клиент ${client.id}`}</strong><small>SAFRWAY ID {client.id} · {client.telegram_id_mask}</small></div><span>{client.active_visa_count} виз</span><span>{client.requires_attention ? "Требует внимания" : client.bot_status}</span><span>Открыть →</span></button>)}</div>}</section>;
}
