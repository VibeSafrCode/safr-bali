import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import { VisaStatusHelp } from "./VisaStatusHelp";

type Client = { id: number; username?: string; first_name?: string; last_name?: string; telegram_id_mask: string; email?: string; bot_status: string; status?: string; created_at?: string; last_activity_at?: string; tags: string[]; active_visa_count: number; requires_attention: boolean };
type ClientSort = "joined_desc" | "joined_asc" | "name_asc" | "name_desc" | "activity_desc" | "status_asc";
type VisaType = { id: number; code: string; name: string; version: number; rules_verified: boolean };
type ProcessDraft = { id?: number; process_type: string; external_status: string; reference?: string; action?: "UPSERT" | "REMOVE" };
type ProtectedDocument = { id: number; type: string; name: string; visibility: "CLIENT" | "INTERNAL"; expires_on?: string; archived: boolean; download_url?: string };
type ManagerOption = { id: number; name: string; role: string };
type Case = { id: number; user_id: number; country_code: string; custom_visa_name?: string; visa_type: { code: string; name: string }; service_status: string; lifecycle_status: string; publication_status: string; notifications_enabled?: boolean; entry_deadline?: string; stay_end?: string; date_source?: string; next_action_text?: string; recommended_contact_at?: string; version: number; assigned_admin?: ManagerOption; documents?: ProtectedDocument[]; processes?: Array<{ id: number; type: string; external_status: string; reference_mask?: string }> };
type Dialogue = { id: number | null; status: string; messages: Array<{ id: number; author_type: string; body: string; visibility: string; created_at: string; delivery_status?: string }> };
type ClientDetail = { client: Client; visa_cases: Case[]; notes: Array<{ id: number; body: string; pinned: boolean }>; credentials: Array<{ id: number; provider: string; login_mask?: string; service_url?: string }>; dialogue: Dialogue };
type VisaDeletePlan = { case_id: number; visa_type_code: string; dependency_counts: Record<string, number>; unexpected_dependencies: string[]; protected_files_present: boolean; executable: boolean };
type DocumentStorageReadiness = { storage_configured: boolean; storage_private: boolean; encryption_configured: boolean; key_versioned: boolean; key_custody_confirmed: boolean; scanner_configured: boolean; retention_configured: boolean; backup_restore_verified: boolean; ready: boolean; max_bytes: number };

const dialogueCopy = {
  ru: { title: "Диалог с клиентом", empty: "Сообщений пока нет.", loading: "Загружаем диалог…", failed: "Не удалось загрузить диалог.", retry: "Повторить", retryDelivery: "Повторить отправку", retryingDelivery: "Повторяем отправку…", retrySuccess: "Повторная доставка поставлена в очередь без дубликата.", retryError: "Не удалось повторить доставку. Попробуйте ещё раз.", client: "Клиент", staff: "Менеджер", queued: "в очереди", delivered: "доставлено", deliveryFailed: "ошибка доставки", privacy: "Не отправляйте паспортные данные или файлы в Telegram. Используйте защищённые документы кабинета.", label: "Сообщение клиенту через Telegram", sending: "Отправляем…", send: "Отправить клиенту", pending: "Сообщение отправляется…", success: "Сообщение поставлено в защищённую очередь Telegram один раз.", error: "Не удалось отправить сообщение. Повторите попытку." },
  en: { title: "Client dialogue", empty: "No messages yet.", loading: "Loading dialogue…", failed: "Could not load the dialogue.", retry: "Retry", retryDelivery: "Retry delivery", retryingDelivery: "Retrying delivery…", retrySuccess: "Delivery was requeued without creating a duplicate.", retryError: "Could not retry delivery. Please try again.", client: "Client", staff: "Manager", queued: "queued", delivered: "delivered", deliveryFailed: "delivery failed", privacy: "Do not send passport details or files in Telegram. Use protected cabinet documents.", label: "Message the client via Telegram", sending: "Sending…", send: "Send to client", pending: "Message is being sent…", success: "Message was queued for protected Telegram delivery once.", error: "Could not send the message. Please try again." },
} as const;

function adminHeaders(csrf: string) { return { "Content-Type": "application/json", "X-CSRF-Token": csrf }; }

function clientListState() {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get("sort") as ClientSort | null;
  return {
    search: params.get("search") ?? "",
    visaFilter: params.get("visa_filter") ?? "",
    sort: (["joined_desc", "joined_asc", "name_asc", "name_desc", "activity_desc", "status_asc"] as ClientSort[]).includes(sort ?? "" as ClientSort) ? sort! : "joined_desc" as ClientSort,
  };
}

function clientListUrl(search: string, visaFilter: string, sort: ClientSort) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (visaFilter) params.set("visa_filter", visaFilter);
  if (sort !== "joined_desc") params.set("sort", sort);
  return `/admin/clients/${params.size ? `?${params}` : ""}`;
}

function Dialog({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = previousBodyOverflow; previous?.focus(); };
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
  void current;
  void transitions;
  const currentDescription = statusDescriptions[locale][value as keyof typeof statusDescriptions.ru] ?? (locale === "ru" ? "Системный рабочий статус." : "System workflow status.");
  return <div className="crm-status-picker"><span>{label}<span className="crm-info" tabIndex={0} title={currentDescription} aria-label={`${label}: ${currentDescription}`}>i</span></span><details><summary aria-disabled={disabled}><strong>{value}</strong><span aria-hidden="true">⌄</span></summary><div className="crm-status-options" role="listbox" aria-label={label}>{options.map((code) => {
    const description = statusDescriptions[locale][code as keyof typeof statusDescriptions.ru] ?? (locale === "ru" ? "Системный статус без дополнительного юридического толкования." : "A system status without additional legal interpretation.");
    return <button key={code} type="button" className="crm-status-option" role="option" aria-selected={value === code} disabled={disabled} title={description} onClick={(event) => { onChange(code); event.currentTarget.closest("details")?.removeAttribute("open"); }}><strong>{code}</strong>{value === code && <span aria-hidden="true">✓</span>}<small>{description}</small></button>;
  })}</div></details><small>{locale === "ru" ? "Код сохраняется без перевода. Справка описывает только рабочее состояние." : "The code is stored unchanged. Help describes workflow only."}</small></div>;
}

export function AdminVisaCRM({ csrfToken, initialClientId, locale = "ru", actorRole = "admin" }: { csrfToken: string; initialClientId?: number | null; locale?: "ru" | "en"; actorRole?: string }) {
  const initialList = clientListState();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientTotal, setClientTotal] = useState(0);
  const [types, setTypes] = useState<VisaType[]>([]);
  const [selected, setSelected] = useState<ClientDetail | null>(null);
  const [search, setSearch] = useState(initialList.search);
  const [visaFilter, setVisaFilter] = useState(initialList.visaFilter);
  const [sort, setSort] = useState<ClientSort>(initialList.sort);
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
  const [credentialUrl, setCredentialUrl] = useState("");
  const [credentialLogin, setCredentialLogin] = useState("");
  const [credentialSecret, setCredentialSecret] = useState("");
  const [revealedCredential, setRevealedCredential] = useState<{ id: number; login?: string; secret: string } | null>(null);
  const [processes, setProcesses] = useState<ProcessDraft[]>([]);
  const [submitting, setSubmitting] = useState("");
  const [publicationConfirm, setPublicationConfirm] = useState<"publish" | "hide" | "archive" | null>(null);
  const [saveNotifyConfirm, setSaveNotifyConfirm] = useState(false);
  const [showToClient, setShowToClient] = useState(false);
  const [notifyClient, setNotifyClient] = useState(false);
  const [deletePlan, setDeletePlan] = useState<{ visa: Case; plan: VisaDeletePlan; idempotencyKey: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [managerMessage, setManagerMessage] = useState("");
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");
  const [pendingClientId, setPendingClientId] = useState<number | null>(null);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [managerAssignmentEnabled, setManagerAssignmentEnabled] = useState(false);
  const [assignedManagerId, setAssignedManagerId] = useState(0);
  const [assignmentReason, setAssignmentReason] = useState("");
  const [assignmentConfirm, setAssignmentConfirm] = useState(false);
  const [documentStorage, setDocumentStorage] = useState<DocumentStorageReadiness | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [documentType, setDocumentType] = useState("VISA");
  const [documentVisibility, setDocumentVisibility] = useState<"CLIENT" | "INTERNAL">("INTERNAL");
  const [documentUploadKey, setDocumentUploadKey] = useState("");
  const [documentState, setDocumentState] = useState<"idle" | "pending" | "accepted" | "rejected" | "error">("idle");
  const messageFieldRef = useRef<HTMLTextAreaElement>(null);
  const messageNodeRefs = useRef(new Map<number, HTMLLIElement>());
  const dialogueLogRef = useRef<HTMLOListElement>(null);
  const listScrollRef = useRef(0);
  const dialogueLocale = locale;
  const chat = dialogueCopy[dialogueLocale];
  const isRootAdmin = actorRole === "admin";
  const ui = (ru: string, en: string) => locale === "ru" ? ru : en;

  useLayoutEffect(() => {
    if (selected) messageFieldRef.current?.focus();
  }, [selected?.client.id]);

  useLayoutEffect(() => {
    const log = dialogueLogRef.current;
    if (!selected || !log) return;
    const scrollToLatest = () => { log.scrollTop = log.scrollHeight - log.clientHeight; };
    scrollToLatest();
    const frame = window.requestAnimationFrame(scrollToLatest);
    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(log);
    if (log.lastElementChild) observer.observe(log.lastElementChild);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [selected?.client.id, selected?.dialogue?.messages?.length]);

  useEffect(() => {
    if (!revealedCredential) return;
    const timer = window.setTimeout(() => { setRevealedCredential(null); setFeedback(ui("Доступ автоматически скрыт.", "Access was hidden automatically.")); }, 20_000);
    return () => window.clearTimeout(timer);
  }, [revealedCredential]);

  async function loadClients(query = search, filter = visaFilter, nextSort = sort, syncUrl = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      if (filter) params.set("visa_filter", filter);
      params.set("sort", nextSort);
      const suffix = params.size ? `?${params}` : "";
      const [clientData, typeData, storageData, managerData] = await Promise.all([
        appApiClient().request<{ items: Client[]; total: number }>(`/api/web/admin/clients${suffix}`),
        appApiClient().request<{ items: VisaType[] }>("/api/web/admin/visa-cases/types"),
        appApiClient().request<DocumentStorageReadiness>("/api/web/admin/visa-cases/document-storage/readiness"),
        isRootAdmin ? appApiClient().request<{ enabled: boolean; items: ManagerOption[] }>("/api/web/admin/visa-cases/staff/visa-managers") : Promise.resolve({ enabled: false, items: [] }),
      ]);
      setClients(clientData.items); setClientTotal(clientData.total); setTypes(typeData.items);
      setDocumentStorage(storageData); setManagerOptions(managerData.items); setManagerAssignmentEnabled(managerData.enabled);
      if (syncUrl && !selected) window.history.replaceState({ ...(window.history.state ?? {}), safrClientList: true }, "", clientListUrl(query, filter, nextSort));
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setLoading(false); }
  }

  async function openClient(id: number, pushRoute = true) {
    if (pushRoute) {
      listScrollRef.current = window.scrollY;
      window.history.replaceState({ ...(window.history.state ?? {}), safrClientList: true, listScroll: listScrollRef.current }, "", clientListUrl(search, visaFilter, sort));
      window.history.pushState({ safrClientDetail: true, listScroll: listScrollRef.current }, "", `/admin/clients/${id}/${window.location.search}`);
    }
    setPendingClientId(id); setDetailState("loading"); setError("");
    try {
      setSelected(await appApiClient().request<ClientDetail>(`/api/web/admin/clients/${id}`));
      setDetailState("idle");
    }
    catch { setSelected(null); setDetailState("error"); }
  }

  function showClientList(useHistory = true) {
    if (useHistory && window.history.state?.safrClientDetail) {
      window.history.back();
      return;
    }
    window.history.replaceState({ safrClientList: true, listScroll: listScrollRef.current }, "", clientListUrl(search, visaFilter, sort));
    setSelected(null); setPendingClientId(null); setDetailState("idle");
    window.requestAnimationFrame(() => window.scrollTo({ top: listScrollRef.current }));
  }

  useEffect(() => {
    void loadClients(search, visaFilter, sort);
    const routeId = Number(window.location.pathname.match(/^\/admin\/clients\/(\d+)\/?$/)?.[1]);
    if (initialClientId) void openClient(initialClientId, false);
    else if (Number.isFinite(routeId) && routeId > 0) void openClient(routeId, false);
    const onPopState = (event: PopStateEvent) => {
      const id = Number(window.location.pathname.match(/^\/admin\/clients\/(\d+)\/?$/)?.[1]);
      if (Number.isFinite(id) && id > 0) void openClient(id, false);
      else {
        setSelected(null); setPendingClientId(null); setDetailState("idle");
        const top = Number(event.state?.listScroll ?? listScrollRef.current);
        window.requestAnimationFrame(() => window.scrollTo({ top: Number.isFinite(top) ? top : 0 }));
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function createCase(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !visaTypeId) return;
    try {
      const type = types.find((item) => item.id === Number(visaTypeId));
      if (type?.code === "OTHER" && !customName.trim()) { setError(ui("Для варианта Other Visa укажите ручное название.", "Enter a custom name for Other Visa.")); return; }
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
    setShowToClient(item.publication_status === "PUBLISHED"); setNotifyClient(false);
    setAssignedManagerId(item.assigned_admin?.id ?? 0); setAssignmentReason(""); setAssignmentConfirm(false);
    setDocumentFile(null); setDocumentName(""); setDocumentType("VISA"); setDocumentVisibility("INTERNAL"); setDocumentUploadKey(""); setDocumentState("idle");
    setProcesses((item.processes ?? []).map((process) => ({ id: process.id, process_type: process.type, external_status: process.external_status, action: "UPSERT" })));
  }

  async function saveCase(event: React.FormEvent | null, notifyClient = false) {
    event?.preventDefault(); if (!selected || !selectedCase || submitting) return;
    const body: Record<string, unknown> = { service_status: serviceStatus, lifecycle_status: lifecycleStatus, next_action_text: nextAction || null, recommended_contact_at: recommendedContact ? `${recommendedContact}T00:00:00+08:00` : null, processes, show_to_client: showToClient, reason: "Manual root-admin aggregate update", expected_version: selectedCase.version, notify_client: notifyClient, idempotency_key: crypto.randomUUID() };
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
    try { await appApiClient().request(`/api/web/admin/visa-cases/${selectedCase.id}/publication/${action}`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ notify_client: action === "publish", reason: `Manual ${action}`, idempotency_key: crypto.randomUUID() }) }); setPublicationConfirm(null); setSelectedCase(null); setFeedback(action === "publish" ? ui("Кейс опубликован; уведомление поставлено в очередь один раз.", "The case was published; one notification was queued.") : action === "hide" ? ui("Кейс скрыт от клиента.", "The case was hidden from the client.") : ui("Кейс архивирован и скрыт от клиента.", "The case was archived and hidden from the client.")); await openClient(selected.client.id); }
    catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(""); }
  }

  async function preparePermanentDelete(visa: Case) {
    if (!isRootAdmin || submitting) return;
    setSubmitting("delete-preview"); setError("");
    try {
      const plan = await appApiClient().request<VisaDeletePlan>(`/api/web/admin/visa-cases/${visa.id}/delete-preview`);
      if (!plan.executable) {
        setError(locale === "ru" ? "Удаление заблокировано зависимостями или защищёнными файлами." : "Delete is blocked by dependencies or protected files.");
        return;
      }
      setDeleteReason("");
      setDeletePlan({ visa, plan, idempotencyKey: crypto.randomUUID() });
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(""); }
  }

  async function permanentlyDeleteVisa() {
    if (!selected || !deletePlan || deleteReason.trim().length < 3 || submitting) return;
    setSubmitting("permanent-delete"); setError("");
    try {
      await appApiClient().request(`/api/web/admin/visa-cases/${deletePlan.visa.id}/permanent-delete`, {
        method: "POST", headers: adminHeaders(csrfToken),
        body: JSON.stringify({ confirm_case_id: deletePlan.visa.id, expected_version: deletePlan.visa.version, reason: deleteReason.trim(), idempotency_key: deletePlan.idempotencyKey }),
      });
      setDeletePlan(null); setDeleteReason(""); setSelectedCase(null);
      setFeedback(locale === "ru" ? "Виза и только её собственные операционные записи удалены. Минимальная запись аудита сохранена." : "The visa and only its case-owned operational rows were deleted. A minimal audit tombstone remains.");
      await openClient(selected.client.id);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 409
        ? (locale === "ru" ? "Версия изменилась; данные не удалены. Обновите карточку и повторите." : "Version changed; nothing was deleted. Refresh the case and retry.")
        : (locale === "ru" ? apiErrorMessage(caught) : "Could not delete the archived visa. Nothing was deleted; retry."));
    }
    finally { setSubmitting(""); }
  }

  function mergeUpdatedCase(updated: Case) {
    setSelectedCase(updated);
    setSelected((current) => current ? { ...current, visa_cases: current.visa_cases.map((item) => item.id === updated.id ? updated : item) } : current);
  }

  async function assignVisaManager() {
    if (!selectedCase || !isRootAdmin || !managerAssignmentEnabled || !assignedManagerId || assignmentReason.trim().length < 3 || submitting) return;
    setSubmitting("assignment"); setError("");
    try {
      const updated = await appApiClient().request<Case>(`/api/web/admin/visa-cases/${selectedCase.id}/assignment`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ assigned_admin_id: assignedManagerId, expected_version: selectedCase.version, reason: assignmentReason.trim(), idempotency_key: crypto.randomUUID() }) });
      mergeUpdatedCase(updated); setAssignmentReason(""); setAssignmentConfirm(false);
      setFeedback(locale === "ru" ? "Ответственный менеджер изменён; прежний менеджер сразу потерял доступ к этой визе." : "The responsible manager changed; the previous manager immediately lost access to this visa.");
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(""); }
  }

  async function uploadProtectedDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCase || !documentStorage?.ready || !documentFile || submitting) return;
    const uploadKey = documentUploadKey || crypto.randomUUID();
    if (!documentUploadKey) setDocumentUploadKey(uploadKey);
    let failure: "rejected" | "error" = "error";
    setSubmitting("document-upload"); setDocumentState("pending"); setError("");
    try {
      const params = new URLSearchParams({ display_name: documentName.trim() || documentFile.name, document_type: documentType, visibility: documentVisibility });
      const client = appApiClient();
      const response = await fetch(new URL(`/api/web/admin/visa-cases/${selectedCase.id}/documents/upload?${params}`, `${client.origin}/`), { method: "POST", credentials: "include", cache: "no-store", headers: { Accept: "application/json", "Content-Type": documentFile.type, "X-CSRF-Token": csrfToken, "Idempotency-Key": uploadKey }, body: documentFile });
      if (!response.ok) {
        failure = response.status === 422 ? "rejected" : "error";
        setDocumentState(failure);
        throw new Error(`protected upload failed: ${response.status}`);
      }
      const updated = await client.request<Case>(`/api/web/admin/visa-cases/${selectedCase.id}`);
      mergeUpdatedCase(updated); setDocumentState("accepted"); setDocumentFile(null); setDocumentName(""); setDocumentUploadKey("");
      setFeedback(locale === "ru" ? "Документ проверен, зашифрован и сохранён. Доступ определяется видимостью." : "The document was scanned, encrypted, and saved. Access follows its visibility.");
    } catch {
      setError(failure === "rejected" ? (locale === "ru" ? "Документ отклонён сканером. Карантинная копия безопасно удалена; исправьте файл и повторите." : "The scanner rejected the document. The quarantined copy was safely removed; correct the file and retry.") : (locale === "ru" ? "Не удалось загрузить документ. Файл не был опубликован; повторите попытку." : "Could not upload the document. It was not published; retry."));
    } finally { setSubmitting(""); }
  }

  async function addCredential(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !credentialLogin || !credentialSecret) return;
    try { await appApiClient().request(`/api/web/admin/clients/${selected.client.id}/credentials`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ provider: credentialProvider || "Indonesia Immigration", service_url: credentialUrl || null, login: credentialLogin, secret: credentialSecret }) }); setCredentialProvider(""); setCredentialUrl(""); setCredentialLogin(""); setCredentialSecret(""); await openClient(selected.client.id); }
    catch (caught) { setError(apiErrorMessage(caught)); }
  }

  async function accessCredential(id: number, action: "REVEAL" | "COPY") {
    if (submitting) return; setSubmitting(`credential-${action.toLowerCase()}`); setFeedback(""); setError("");
    try {
      const result = await appApiClient().request<{ login?: string; secret: string }>(`/api/web/admin/visa-cases/credentials/${id}/access`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ action, reason: `Root-admin ${action.toLowerCase()}` }) });
      if (action === "COPY") { await navigator.clipboard.writeText(result.secret); setFeedback(ui("Скопировано. Значение не показано на экране.", "Copied. The value was not shown on screen.")); }
      else { setRevealedCredential({ id, ...result }); setFeedback(ui("Доступ показан на 20 секунд.", "Access is shown for 20 seconds.")); }
    } catch { setRevealedCredential(null); setFeedback(ui("Доступ недоступен: ключ шифрования не настроен или запрос отклонён. Секрет не раскрыт.", "Access unavailable: the encryption key is not configured or the request was denied. The secret was not disclosed.")); }
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

  const displayedVisaCases = selected
    ? (visaFilter === "archived" ? selected.visa_cases.filter((item) => item.publication_status === "ARCHIVED") : selected.visa_cases)
    : [];


  if (!selected && detailState !== "idle") return <section className="admin-panel crm-client-card" aria-live="polite">
    <button className="admin-back" onClick={() => showClientList()}>← {locale === "ru" ? "Все клиенты" : "All clients"}</button>
    {detailState === "loading" ? <div className="admin-empty" role="status">{chat.loading}</div> : <div className="admin-empty" role="alert"><p>{chat.failed}</p><button className="button secondary" onClick={() => pendingClientId && void openClient(pendingClientId)}>{chat.retry}</button></div>}
  </section>;

  if (selected) return <section className="admin-panel crm-client-card">
    <button className="admin-back" onClick={() => showClientList()}>← {locale === "ru" ? "Все клиенты" : "All clients"}</button>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {feedback && <div className={feedback.startsWith(ui("Доступ недоступен", "Access unavailable")) ? "admin-alert" : "admin-outcome"} role="status" aria-live="polite">{feedback}</div>}
    <header className="crm-client-head"><div><span className="eyebrow">SAFRWAY ID {selected.client.id}</span><h2>{[selected.client.first_name, selected.client.last_name].filter(Boolean).join(" ") || selected.client.username || ui("Клиент", "Client")}</h2><p>{selected.client.telegram_id_mask} · {selected.client.bot_status}</p>{isRootAdmin && <form className="crm-tag-form" onSubmit={addTag}><input aria-label={ui("Новый внутренний тег", "New internal tag")} placeholder={ui("Добавить тег", "Add tag")} value={tag} onChange={(event) => setTag(event.target.value)} /><button disabled={!tag.trim()}>{ui("Добавить", "Add")}</button></form>}</div><button className="button primary" onClick={() => setCreateOpen(true)}>+ {ui("Добавить визу", "Add visa")}</button></header>
    <div className="crm-tabs" aria-label={ui("Разделы карточки клиента", "Client profile sections")}><span>{ui("Обзор", "Overview")}</span><span>{ui("Визы", "Visas")}</span><span>{ui("Документы", "Documents")}</span><span>{ui("Доступы", "Access")}</span><span>{ui("История", "History")}</span><span>{ui("Заметки", "Notes")}</span></div>
    <section><h3>{visaFilter === "archived" ? ui("Архив виз", "Visa archive") : ui("Визы и услуги", "Visas and services")}</h3>{displayedVisaCases.length ? <div className="crm-case-list">{displayedVisaCases.map((item) => <div className="crm-case-row" key={item.id}><button type="button" onClick={() => editCase(item)}><div><strong>{ui("Индонезия", "Indonesia")} · {item.custom_visa_name || item.visa_type.name}</strong><small>{item.publication_status} · v{item.version}</small></div><span>{item.lifecycle_status}</span><span>{item.next_action_text || ui("Следующее действие не задано", "No next action set")}</span></button><VisaStatusHelp kind="visa" code={item.lifecycle_status} locale={locale} />{isRootAdmin && visaFilter === "archived" && <button className="crm-danger-action" type="button" disabled={!!submitting} onClick={() => void preparePermanentDelete(item)}>{locale === "ru" ? "Удалить навсегда…" : "Delete permanently…"}</button>}</div>)}</div> : <div className="admin-empty">{visaFilter === "archived" ? ui("В архиве виз нет.", "Visa archive is empty.") : ui("Визовых кейсов пока нет.", "No visa cases yet.")}</div>}</section>
    <section className={`crm-split${isRootAdmin ? "" : " is-single"}`}><div><h3>{chat.title}</h3>{selected.dialogue?.messages?.filter((item) => item.visibility === "client").length ? <ol ref={dialogueLogRef} className="chat-messages" role="log" aria-label={chat.title} aria-live="polite" aria-relevant="additions text">{selected.dialogue.messages.filter((item) => item.visibility === "client").map((item) => { const delivery = item.delivery_status === "failed" ? chat.deliveryFailed : item.delivery_status === "delivered" ? chat.delivered : chat.queued; return <li ref={(node) => { if (node) messageNodeRefs.current.set(item.id, node); else messageNodeRefs.current.delete(item.id); }} tabIndex={-1} className={item.author_type === "client" ? "chat-message from-client" : "chat-message from-staff"} key={item.id}><span>{item.author_type === "client" ? chat.client : `${chat.staff} · ${delivery}`}</span><time dateTime={item.created_at}>{new Intl.DateTimeFormat(dialogueLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time><p>{item.body}</p>{item.author_type === "staff" && item.delivery_status === "failed" && <button type="button" disabled={!!submitting} onClick={() => void retryDelivery(item.id)}>{submitting === `retry-${item.id}` ? chat.retryingDelivery : chat.retryDelivery}</button>}</li>; })}</ol> : <div className="admin-empty">{chat.empty}</div>}<form className="chat-form" onSubmit={sendManagerMessage}><p className="admin-risk">{chat.privacy}</p><label>{chat.label}<textarea ref={messageFieldRef} disabled={!!submitting} value={managerMessage} onChange={(event) => setManagerMessage(event.target.value)} /></label><button className="button primary" disabled={!managerMessage.trim() || !!submitting}>{submitting === "manager-message" ? chat.sending : chat.send}</button></form></div>{isRootAdmin && <div><h3>{ui("Внутренние заметки", "Internal notes")}</h3>{selected.notes.map((item) => <article className="crm-note" key={item.id}>{item.pinned && <strong>{ui("Закреплено", "Pinned")}</strong>}<p>{item.body}</p></article>)}<form onSubmit={addNote}><label>{ui("Новая заметка", "New note")}<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label><button className="button secondary" disabled={!note.trim()}>{ui("Добавить", "Add")}</button></form></div>}</section>
    {isRootAdmin && <details className="crm-advanced crm-immigration-access"><summary>{ui("Добавить ЛК иммиграции", "Add immigration account")}</summary><div className="crm-advanced-body"><p className="admin-risk">{ui("Только учётная запись сайта иммиграции. Значения зашифрованы, автоматически скрываются через 20 секунд, каждое открытие и копирование аудируется.", "Immigration website account only. Values are encrypted, hidden automatically after 20 seconds, and every reveal or copy is audited.")}</p>{selected.credentials.map((item) => <article className="crm-note" key={item.id}><strong>{item.provider}</strong>{item.service_url && <a href={item.service_url} target="_blank" rel="noreferrer">{ui("Открыть сайт", "Open website")}</a>}<p>{revealedCredential?.id === item.id ? `${revealedCredential.login ?? ""} · ${revealedCredential.secret}` : item.login_mask || ui("Логин скрыт", "Login hidden")}</p><div>{revealedCredential?.id === item.id ? <button type="button" onClick={() => { setRevealedCredential(null); setFeedback(ui("Доступ снова скрыт.", "Access is hidden again.")); }}>{ui("Скрыть сейчас", "Hide now")}</button> : <button type="button" disabled={!!submitting} onClick={() => void accessCredential(item.id, "REVEAL")}>{submitting === "credential-reveal" ? ui("Открываем…", "Revealing…") : ui("Показать", "Reveal")}</button>}<button type="button" disabled={!!submitting} onClick={() => void accessCredential(item.id, "COPY")}>{submitting === "credential-copy" ? ui("Копируем…", "Copying…") : ui("Копировать", "Copy")}</button></div></article>)}<form onSubmit={addCredential}><label>{ui("Сайт иммиграции", "Immigration website")}<input type="url" placeholder="https://…" value={credentialUrl} onChange={(event) => setCredentialUrl(event.target.value)} /></label><label>{ui("Email или логин", "Email or login")}<input autoComplete="off" required value={credentialLogin} onChange={(event) => setCredentialLogin(event.target.value)} /></label><label>{ui("Пароль", "Password")}<input type="password" autoComplete="new-password" required value={credentialSecret} onChange={(event) => setCredentialSecret(event.target.value)} /></label><button className="button secondary" disabled={!credentialLogin || !credentialSecret}>{ui("Сохранить зашифрованно", "Save encrypted")}</button></form></div></details>}
    {createOpen && <Dialog labelledBy="visa-create-title" onClose={() => setCreateOpen(false)}><form onSubmit={createCase}><span className="eyebrow">{ui("Ручной режим", "Manual mode")}</span><h2 id="visa-create-title">{ui("Новая виза", "New visa")}</h2><label>{ui("Страна", "Country")}<input value={ui("Индонезия", "Indonesia")} disabled /></label><label>{ui("Тип визы", "Visa type")}<select required value={visaTypeId} onChange={(event) => setVisaTypeId(event.target.value)}><option value="">{ui("Выберите", "Select")}</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}{type.rules_verified ? "" : ` · ${ui("ручные даты", "manual dates")}`}</option>)}</select></label>{types.find((type) => type.id === Number(visaTypeId))?.code === "OTHER" && <label>{ui("Название визы", "Visa name")}<input required value={customName} onChange={(event) => setCustomName(event.target.value)} /></label>}<p>{ui("Кейс будет сохранён как черновик и не появится у клиента до явной публикации.", "The case will be saved as a draft and will not appear to the client until it is explicitly published.")}</p><div><button type="button" onClick={() => setCreateOpen(false)}>{ui("Отмена", "Cancel")}</button><button className="button primary">{ui("Сохранить черновик", "Save draft")}</button></div></form></Dialog>}
    {selectedCase && <Dialog labelledBy="visa-edit-title" onClose={() => { if (!submitting) setSelectedCase(null); }}><div className="crm-visa-editor">
      <div className="crm-editor-title"><div><span className="eyebrow">{selectedCase.publication_status} · v{selectedCase.version}</span><h2 id="visa-edit-title">{ui("Редактировать визу", "Edit visa")}</h2></div><div className="crm-editor-tools"><details className="crm-overflow"><summary aria-label={ui("Дополнительные действия", "Additional actions")}>•••</summary><button disabled={!!submitting} type="button" onClick={() => setShowToClient(false)}>{ui("Скрыть после сохранения", "Hide after saving")}</button><button disabled={!!submitting} type="button" onClick={() => setPublicationConfirm("archive")}>{ui("Переместить в архив", "Move to archive")}</button></details><button className="crm-delete-x" disabled={!!submitting} type="button" aria-label={dialogueLocale === "ru" ? "Закрыть редактор" : "Close editor"} title={dialogueLocale === "ru" ? "Закрыть" : "Close"} onClick={() => setSelectedCase(null)}>×</button></div></div>
      <div className="crm-editor-grid"><StatusPicker label={ui("Статус услуги", "Service status")} value={serviceStatus} current={selectedCase.service_status} transitions={serviceTransitions} options={["PURCHASED","DOCUMENTS_REQUIRED","DOCUMENTS_RECEIVED","SUBMITTED","WAITING_PAYMENT","PAID","PROCESSING","ACTION_REQUIRED","COMPLETED","CANCELLED"]} locale={dialogueLocale} onChange={setServiceStatus} disabled={!!submitting} /><StatusPicker label={ui("Статус визы", "Visa status")} value={lifecycleStatus} current={selectedCase.lifecycle_status} transitions={lifecycleTransitions} options={["NOT_ISSUED","ISSUED_NOT_ACTIVATED","ACTIVE","EXPIRING","EXTENSION_PROCESSING","EXTENDED","EXPIRED","CANCELLED","REFUSED"]} locale={dialogueLocale} onChange={setLifecycleStatus} disabled={!!submitting} /></div>
      <div className="crm-editor-grid"><label>{ui("Использовать до", "Use by")}<input disabled={!!submitting} type="date" value={entryDeadline} onChange={(event) => setEntryDeadline(event.target.value)} /></label><label>{ui("Находиться до", "Stay until")}<input disabled={!!submitting} type="date" value={stayEnd} onChange={(event) => setStayEnd(event.target.value)} /></label></div>
      {(entryDeadline || stayEnd) && <label>{ui("Источник подтверждённой даты", "Confirmed date source")}<select disabled={!!submitting} required value={dateSource} onChange={(event) => setDateSource(event.target.value)}><option value="">{ui("Выберите источник", "Select source")}</option><option value="BOSS_ADMIN">Boss Admin</option><option value="VISA_ADMIN">Visa Admin</option><option value="IMMIGRATION">Immigration</option>{dateSource && !["BOSS_ADMIN","VISA_ADMIN","IMMIGRATION"].includes(dateSource) && <option value={dateSource}>{ui("Ранее сохранённый источник", "Previously saved source")}</option>}</select></label>}
      <label>{ui("Следующее действие", "Next action")}<textarea disabled={!!submitting} value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></label><label>{ui("Рекомендуемая дата связи", "Recommended contact date")}<input disabled={!!submitting} type="date" value={recommendedContact} onChange={(event) => setRecommendedContact(event.target.value)} /></label>
      <details className="crm-advanced"><summary>{ui("Дополнительно: процесс и номер заявки", "Advanced: process and application number")}</summary><fieldset disabled={!!submitting}><legend className="sr-only">{ui("Ручные процессы", "Manual processes")}</legend>{processes.map((process, index) => process.action === "REMOVE" ? <div className="crm-process-row is-removed" key={process.id ?? index}><span>{process.process_type} · {process.external_status}</span><button type="button" onClick={() => updateStagedProcess(index, { action: "UPSERT" })}>{ui("Вернуть", "Restore")}</button></div> : <div className="crm-process-row" key={process.id ?? `new-${index}`}><label>{ui("Тип процесса", "Process type")}<select value={process.process_type} onChange={(event) => updateStagedProcess(index, { process_type: event.target.value })}>{["APPLICATION","EXTENSION","BRIDGING","CONVERSION","RE_ENTRY","CANCELLATION"].map((item) => <option key={item}>{item}</option>)}</select></label><StatusPicker label={`${ui("Внешний статус", "External status")} ${index + 1}`} value={process.external_status} current={process.external_status} transitions={{ [process.external_status]: [] }} options={["UNKNOWN","WAITING_PAYMENT","PAID","SUBMITTED","PROCESSING","ACTION_REQUIRED","BIOMETRICS_REQUIRED","APPROVED","REJECTED","CANCELLED"]} locale={dialogueLocale} onChange={(value) => updateStagedProcess(index, { external_status: value })} disabled={!!submitting} /><label>{ui("Номер заявки / дела", "Application / case number")}<input value={process.reference ?? ""} onChange={(event) => updateStagedProcess(index, { reference: event.target.value })} /></label><button type="button" onClick={() => removeStagedProcess(index)}>{ui("Убрать процесс", "Remove process")}</button></div>)}<button type="button" onClick={addStagedProcess}>+ {ui("Добавить процесс вручную", "Add process manually")}</button></fieldset></details>
      {isRootAdmin && <details className="crm-advanced crm-assignment"><summary>{locale === "ru" ? "Ответственный менеджер" : "Responsible manager"}</summary><div className="crm-advanced-body"><p>{selectedCase.assigned_admin?.name ?? (locale === "ru" ? "Не определён" : "Not set")} · {selectedCase.assigned_admin?.role ?? "—"}</p><label>{locale === "ru" ? "Передать визу" : "Assign visa"}<select disabled={!managerAssignmentEnabled || !!submitting} value={assignedManagerId} onChange={(event) => setAssignedManagerId(Number(event.target.value))}><option value="0">—</option>{managerOptions.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.role}</option>)}</select></label><label>{locale === "ru" ? "Причина назначения" : "Assignment reason"}<input disabled={!managerAssignmentEnabled || !!submitting} value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} /></label><button type="button" disabled={!managerAssignmentEnabled || !!submitting || !assignedManagerId || assignedManagerId === selectedCase.assigned_admin?.id || assignmentReason.trim().length < 3} onClick={() => setAssignmentConfirm(true)}>{locale === "ru" ? "Проверить назначение" : "Review assignment"}</button>{!managerAssignmentEnabled && <p className="admin-risk">{locale === "ru" ? "Кабинет визового менеджера выключен feature flag и остаётся deny-by-default." : "The visa-manager cabinet is feature-flagged off and remains deny-by-default."}</p>}</div></details>}
      <section className="crm-documents" aria-labelledby="protected-documents-title"><div><h3 id="protected-documents-title">{locale === "ru" ? "Защищённые документы" : "Protected documents"}</h3><span className={documentStorage?.ready ? "admin-outcome" : "admin-risk"}>{documentStorage?.ready ? (locale === "ru" ? "Хранилище, ключ, сканер, retention и restore-proof готовы" : "Storage, key, scanner, retention, and restore proof are ready") : (locale === "ru" ? "Загрузка заблокирована до полной защищённой настройки" : "Upload is blocked until protected configuration is complete")}</span></div>{selectedCase.documents?.length ? <ul className="crm-document-list">{selectedCase.documents.map((document) => <li key={document.id}><div><strong>{document.name}</strong><small>{document.type} · {document.visibility === "CLIENT" ? (locale === "ru" ? "видит клиент" : "client visible") : (locale === "ru" ? "только команда" : "staff only")}{document.archived ? ` · ${locale === "ru" ? "архив" : "archived"}` : ""}</small></div>{document.download_url ? <a className="button secondary" href={document.download_url}>{locale === "ru" ? "Скачать защищённо" : "Secure download"}</a> : <span className="admin-risk">{locale === "ru" ? "Недоступен: нет подтверждённой защищённой загрузки" : "Unavailable: no verified protected upload"}</span>}</li>)}</ul> : <div className="admin-empty">{locale === "ru" ? "Документов пока нет." : "No documents yet."}</div>}<form className="crm-document-upload" onSubmit={uploadProtectedDocument}><label>{locale === "ru" ? "Файл PDF, PNG или JPEG" : "PDF, PNG, or JPEG file"}<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={!documentStorage?.ready || !!submitting} onChange={(event) => { const file = event.target.files?.[0] ?? null; setDocumentFile(file); setDocumentName(file?.name ?? ""); setDocumentUploadKey(crypto.randomUUID()); setDocumentState("idle"); }} /></label><label>{locale === "ru" ? "Название для клиента/команды" : "Display name"}<input disabled={!documentStorage?.ready || !!submitting} value={documentName} onChange={(event) => setDocumentName(event.target.value)} /></label><div className="crm-editor-grid"><label>{locale === "ru" ? "Категория" : "Category"}<select disabled={!documentStorage?.ready || !!submitting} value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="VISA">Visa</option><option value="PASSPORT">Passport</option><option value="IMMIGRATION_NOTICE">Immigration notice</option><option value="OTHER">Other</option></select></label><label>{locale === "ru" ? "Видимость" : "Visibility"}<select disabled={!documentStorage?.ready || !!submitting} value={documentVisibility} onChange={(event) => setDocumentVisibility(event.target.value as "CLIENT" | "INTERNAL")}><option value="INTERNAL">{locale === "ru" ? "Только команда" : "Staff only"}</option><option value="CLIENT">{locale === "ru" ? "Клиенту в кабинете" : "Client cabinet"}</option></select></label></div><button className="button secondary" disabled={!documentStorage?.ready || !documentFile || !documentName.trim() || !!submitting}>{submitting === "document-upload" ? (locale === "ru" ? "Карантин → сканирование → шифрование…" : "Quarantine → scan → encrypt…") : documentState === "rejected" || documentState === "error" ? (locale === "ru" ? "Повторить загрузку" : "Retry upload") : (locale === "ru" ? "Проверить и загрузить" : "Scan and upload")}</button><div aria-live="polite" role="status">{documentState === "pending" ? (locale === "ru" ? "Файл находится в карантине и проверяется. Не закрывайте редактор." : "The file is quarantined and being scanned. Keep the editor open.") : documentState === "accepted" ? (locale === "ru" ? "Файл принят, зашифрован и доступен по выбранной видимости." : "The file was accepted, encrypted, and follows the selected visibility.") : documentState === "rejected" ? (locale === "ru" ? "Файл отклонён; карантинная копия удалена. Выберите исправленный файл и повторите." : "The file was rejected; the quarantined copy was removed. Choose a corrected file and retry.") : documentState === "error" ? (locale === "ru" ? "Загрузка не завершена и ничего не опубликовано. Можно повторить безопасно." : "Upload did not complete and nothing was published. It is safe to retry.") : ""}</div></form></section>
      <div className="crm-save-preferences"><label className="crm-toggle"><input type="checkbox" checked={showToClient} disabled={!!submitting} onChange={(event) => { setShowToClient(event.target.checked); if (!event.target.checked) setNotifyClient(false); }} /><span><strong>{ui("Показывать клиенту", "Show to client")}</strong><small>{ui("Виза появится в «Мои визы» после сохранения.", "The visa will appear in My visas after saving.")}</small></span></label><label className="crm-toggle"><input type="checkbox" checked={notifyClient} disabled={!!submitting || !showToClient || selectedCase.notifications_enabled === false} onChange={(event) => setNotifyClient(event.target.checked)} /><span><strong>{ui("Уведомить клиента", "Notify client")}</strong><small>{ui("После успешного сохранения будет создано ровно одно уведомление CASE_UPDATED.", "Exactly one CASE_UPDATED notification will be created after a successful save.")}</small></span></label></div>
      <div className="crm-save-actions"><button disabled={!!submitting} type="button" onClick={() => setSelectedCase(null)}>{ui("Отмена", "Cancel")}</button><button disabled={!!submitting || (!!(entryDeadline || stayEnd) && !dateSource)} className="button primary" type="button" onClick={() => { if (notifyClient) setSaveNotifyConfirm(true); else void saveCase(null, false); }}>{submitting === "document-upload" ? ui("Загрузка документа…", "Document upload in progress…") : submitting ? ui("Сохраняем всё…", "Saving everything…") : notifyClient ? ui("Сохранить и уведомить", "Save and notify") : ui("Сохранить", "Save")}</button></div>{selectedCase.notifications_enabled === false && <p className="admin-risk" role="status">{dialogueLocale === "ru" ? "Уведомления для этой визы отключены клиентом; изменения можно сохранить без сообщения." : "The client disabled notifications for this visa; changes can be saved without a message."}</p>}
    </div></Dialog>}
    {saveNotifyConfirm && <Dialog labelledBy="save-notify-title" onClose={() => setSaveNotifyConfirm(false)}><div><h2 id="save-notify-title">{dialogueLocale === "ru" ? "Сохранить все изменения и уведомить?" : "Save all changes and notify?"}</h2><p>{dialogueLocale === "ru" ? "Кейс и все процессы сохранятся одной транзакцией, затем будет создано ровно одно уведомление CASE_UPDATED." : "The case and all processes will be saved in one transaction, then exactly one CASE_UPDATED notification will be created."}</p><div><button type="button" disabled={!!submitting} onClick={() => setSaveNotifyConfirm(false)}>{dialogueLocale === "ru" ? "Отмена" : "Cancel"}</button><button className="button primary" type="button" disabled={!!submitting} onClick={() => { setSaveNotifyConfirm(false); void saveCase(null, true); }}>{dialogueLocale === "ru" ? "Подтвердить сохранение" : "Confirm save"}</button></div></div></Dialog>}
    {assignmentConfirm && selectedCase && <Dialog labelledBy="assignment-confirm-title" onClose={() => { if (!submitting) setAssignmentConfirm(false); }}><section><h2 id="assignment-confirm-title">{locale === "ru" ? "Изменить ответственного менеджера?" : "Change the responsible manager?"}</h2><p>{locale === "ru" ? "После подтверждения прежний менеджер сразу потеряет доступ к этой визе и её защищённым документам. Действие будет записано в аудит." : "After confirmation, the previous manager immediately loses access to this visa and its protected documents. The action is audited."}</p><p><strong>{managerOptions.find((manager) => manager.id === assignedManagerId)?.name ?? "—"}</strong></p><div><button type="button" disabled={!!submitting} onClick={() => setAssignmentConfirm(false)}>{locale === "ru" ? "Отмена" : "Cancel"}</button><button className="button primary" type="button" disabled={!!submitting} onClick={() => void assignVisaManager()}>{submitting === "assignment" ? (locale === "ru" ? "Назначаем…" : "Assigning…") : (locale === "ru" ? "Да, изменить" : "Yes, change")}</button></div></section></Dialog>}
    {publicationConfirm && selectedCase && <Dialog labelledBy="visa-publication-title" onClose={() => { if (!submitting) setPublicationConfirm(null); }}><section><h2 id="visa-publication-title">{ui("Переместить визу в архив?", "Move visa to archive?")}</h2><p>{ui("Виза будет скрыта от клиента и появится в разделе «Архив виз». Данные, история и аудит сохранятся; это действие не удаляет записи из базы.", "The visa will be hidden from the client and appear in Visa archive. Data, history, and audit remain; this action does not delete database records.")}</p><div><button disabled={!!submitting} onClick={() => setPublicationConfirm(null)}>{ui("Нет", "No")}</button><button disabled={!!submitting} className="button primary" onClick={() => void publication("archive")}>{submitting ? ui("Перемещаем…", "Moving…") : ui("Да, в архив", "Yes, archive")}</button></div></section></Dialog>}
    {deletePlan && <Dialog labelledBy="visa-delete-title" onClose={() => { if (!submitting) { setDeletePlan(null); setDeleteReason(""); } }}><section className="crm-delete-confirm"><span className="eyebrow">{locale === "ru" ? "Необратимое действие" : "Irreversible action"}</span><h2 id="visa-delete-title">{locale === "ru" ? "Удалить визу навсегда?" : "Delete visa permanently?"}</h2><p><strong>{deletePlan.visa.custom_visa_name || deletePlan.visa.visa_type.name}</strong> · #{deletePlan.visa.id}</p><p>{locale === "ru" ? "Будут удалены только эта виза и её собственные процессы, события, доставки и ссылки на документы. Клиент, заказы, рефералы, Points, диалоги и другие визы не затрагиваются. Останется минимальная запись аудита без персональных данных." : "Only this visa and its own processes, events, deliveries, and document references will be deleted. The client, orders, referrals, Points, conversations, and other visas stay intact. A minimal non-PII audit tombstone remains."}</p><dl>{Object.entries(deletePlan.plan.dependency_counts).map(([name, count]) => <div key={name}><dt>{name.replaceAll("_", " ")}</dt><dd>{count}</dd></div>)}</dl><label>{locale === "ru" ? "Причина удаления" : "Deletion reason"}<textarea autoFocus required minLength={3} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></label><div><button type="button" disabled={!!submitting} onClick={() => { setDeletePlan(null); setDeleteReason(""); }}>{locale === "ru" ? "Нет, отменить" : "No, cancel"}</button><button type="button" className="danger" disabled={!!submitting || deleteReason.trim().length < 3} onClick={() => void permanentlyDeleteVisa()}>{submitting === "permanent-delete" ? (locale === "ru" ? "Удаляем…" : "Deleting…") : (locale === "ru" ? "Да, удалить навсегда" : "Yes, delete permanently")}</button></div></section></Dialog>}
  </section>;

  const filterOptions = [
    ["", locale === "ru" ? "Все" : "All"], ["active", locale === "ru" ? "Активная виза" : "Active visa"], ["processing", locale === "ru" ? "Оформление" : "Processing"], ["action", locale === "ru" ? "Нужно действие" : "Action needed"], ["none", locale === "ru" ? "Без виз" : "No visas"], ["notifications_off", locale === "ru" ? "Без уведомлений" : "Notifications off"], ["archived", locale === "ru" ? "Архив виз" : "Visa archive"],
  ] as const;
  const applyFilter = (filter: string) => { setVisaFilter(filter); void loadClients(search, filter, sort, true); };
  return <section className="admin-panel"><div className="admin-panel-head"><div><h2>{locale === "ru" ? "Клиенты" : "Clients"}</h2><p>{locale === "ru" ? "Единый профиль Telegram и личного кабинета." : "One profile for Telegram and the browser account."}</p></div><span>{clientTotal} {locale === "ru" ? "записей" : "items"}</span></div>{error && <div className="admin-alert" role="alert">{error}</div>}<form className="crm-search" onSubmit={(event) => { event.preventDefault(); void loadClients(search, visaFilter, sort, true); }}><label htmlFor="crm-search">{locale === "ru" ? "Поиск по SAFRWAY ID, Telegram, имени, телефону или email" : "Search by SAFRWAY ID, Telegram, name, phone, or email"}</label><div><input id="crm-search" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label={locale === "ru" ? "Фильтр виз" : "Visa filter"} value={visaFilter} onChange={(event) => applyFilter(event.target.value)}>{filterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label={locale === "ru" ? "Сортировка" : "Sort"} value={sort} onChange={(event) => { const next = event.target.value as ClientSort; setSort(next); void loadClients(search, visaFilter, next, true); }}><option value="joined_desc">{locale === "ru" ? "Сначала новые" : "Newest first"}</option><option value="joined_asc">{locale === "ru" ? "Сначала ранние" : "Oldest first"}</option><option value="name_asc">{locale === "ru" ? "Имя А–Я" : "Name A–Z"}</option><option value="name_desc">{locale === "ru" ? "Имя Я–А" : "Name Z–A"}</option><option value="activity_desc">{locale === "ru" ? "По активности" : "Recent activity"}</option><option value="status_asc">{locale === "ru" ? "По статусу" : "By status"}</option></select><button className="button secondary">{locale === "ru" ? "Найти" : "Search"}</button></div></form><div className="crm-filter-chips" aria-label={locale === "ru" ? "Быстрые фильтры" : "Quick filters"}>{filterOptions.map(([value, label]) => <button type="button" key={value} aria-pressed={visaFilter === value} onClick={() => applyFilter(value)}>{label}</button>)}</div>{loading ? <div className="admin-empty">{locale === "ru" ? "Загружаем клиентов…" : "Loading clients…"}</div> : !clients.length ? <div className="admin-empty">{locale === "ru" ? "Клиенты не найдены." : "No clients found."}</div> : <div className="crm-client-grid">{clients.map((client) => { const name = [client.first_name, client.last_name].filter(Boolean).join(" ") || client.username || (locale === "ru" ? `Клиент ${client.id}` : `Client ${client.id}`); const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); return <button className="crm-client-card-button" key={client.id} onClick={() => void openClient(client.id)}><span className="crm-client-avatar" aria-hidden="true">{initials}</span><span className="eyebrow">SAFRWAY ID {client.id}</span><strong>{name}</strong>{client.username && <span>@{client.username.replace(/^@/, "")}</span>}<dl><div><dt>{locale === "ru" ? "Визы" : "Visas"}</dt><dd>{client.active_visa_count}</dd></div><div><dt>{locale === "ru" ? "Статус" : "Status"}</dt><dd>{client.requires_attention ? (locale === "ru" ? "Нужно действие" : "Action needed") : client.bot_status}</dd></div><div><dt>{locale === "ru" ? "Активность" : "Activity"}</dt><dd>{client.last_activity_at ? new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium" }).format(new Date(client.last_activity_at)) : "—"}</dd></div></dl><small>{locale === "ru" ? "Открыть карточку →" : "Open profile →"}</small></button>; })}</div>}</section>;
}
