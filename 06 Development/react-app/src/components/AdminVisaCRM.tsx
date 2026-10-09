import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { apiErrorMessage, appApiClient } from "../api/client";
import { AdminServiceCountdown, useBaliToday } from "./AdminServiceCountdown";
import { AppIcon } from "./AppIcon";
import { visaDatePresentation } from "./VisaCabinet";
import { formatLifeDate } from "./lifeServices";
import "./admin-life-tiles.css";
import { VisaStatusHelp } from "./VisaStatusHelp";
import { AdminLifeServices } from "./AdminLifeServices";
import { readServicePresence, setServicePresence, type ServicePresence } from "./client-service-filter";
import { visaStatusOptions, visaStatusDescription, visaStatusLabel, visaWasIssued, canToggleVisaIssued, toggleVisaIssued, visaDatePatch, mainVisaProcessIndex, setMainVisaProcess, isAwaitingVisaIssuance, visaProcessChanges, visaVisibilityPreferences, canNotifyVisaChange, keepVisaDateEditor, type StatusKind } from "./visaEditorState";
import "./visa-editor.css";

type Client = { has_registered_services?: boolean; id: number; username?: string; first_name?: string; last_name?: string; telegram_id_mask: string; email?: string; bot_status: string; status?: string; created_at?: string; last_activity_at?: string; tags: string[]; active_visa_count: number; requires_attention: boolean };
type ClientSort = "joined_desc" | "joined_asc" | "name_asc" | "name_desc" | "activity_desc" | "status_asc";
type VisaType = { id: number; code: string; name: string; version: number; rules_verified: boolean };
type ProcessDraft = { id?: number; process_type: string; external_status: string; raw_external_status?: string | null; reference?: string; action?: "UPSERT" | "REMOVE" };
type ProtectedDocument = { id: number; type: string; name: string; visibility: "CLIENT" | "INTERNAL"; expires_on?: string; archived: boolean; download_url?: string };
type ManagerOption = { id: number; name: string; role: string };
type CaseAssignment = { id: number; staff_user_id: number; name: string; primary: boolean };
type NotificationDelivery = { delivery_id: number; audience: string; audience_label: string; type: string; type_label: string; state: string; state_label: string; attempts: number; created_at: string; updated_at: string; delivered_at?: string | null; error_label?: string | null; retry_allowed: boolean; manual_review_required: boolean };
type Case = { id: number; user_id: number; country_code: string; custom_visa_name?: string; visa_type: { code: string; name: string }; service_status: string; lifecycle_status: string; publication_status: string; notifications_enabled?: boolean; issued_on?: string; entered_on?: string; expected_stay_end?: string; entry_deadline?: string; stay_end?: string; date_source?: string; next_action_text?: string; recommended_contact_at?: string; contact_reason_code?: "VISA_EXPIRY" | "EXTENSION" | "NEW_VISA" | "OTHER"; contact_internal_note?: string; contact_plan_version?: number; version: number; assigned_admin?: ManagerOption; assignments?: CaseAssignment[]; deliveries?: NotificationDelivery[]; documents?: ProtectedDocument[]; processes?: Array<{ id: number; type: string; external_status: string; raw_external_status?: string | null; reference_mask?: string }> };
type Dialogue = { id: number | null; status: string; messages: Array<{ id: number; author_type: string; body: string; visibility: string; created_at: string; delivery_status?: string }> };
type ClientDetail = { client: Client; visa_cases: Case[]; notes: Array<{ id: number; body: string; pinned: boolean }>; credentials: Array<{ id: number; provider: string; login_mask?: string; service_url?: string }>; dialogue: Dialogue };
type DocumentStorageReadiness = { storage_configured: boolean; storage_private: boolean; encryption_configured: boolean; key_versioned: boolean; key_custody_confirmed: boolean; scanner_configured: boolean; retention_configured: boolean; backup_restore_verified: boolean; ready: boolean; max_bytes: number };

const unavailableDocumentStorage: DocumentStorageReadiness = {
  storage_configured: false,
  storage_private: false,
  encryption_configured: false,
  key_versioned: false,
  key_custody_confirmed: false,
  scanner_configured: false,
  retention_configured: false,
  backup_restore_verified: false,
  ready: false,
  max_bytes: 0,
};

const dialogueCopy = {
  ru: { title: "Диалог с клиентом", empty: "Сообщений пока нет.", loading: "Загружаем диалог…", failed: "Не удалось загрузить диалог.", retry: "Повторить", retryDelivery: "Повторить отправку", retryingDelivery: "Повторяем отправку…", retrySuccess: "Повторная доставка поставлена в очередь без дубликата.", retryError: "Не удалось повторить доставку. Попробуйте ещё раз.", client: "Клиент", staff: "Менеджер", queued: "в очереди", delivered: "доставлено", deliveryFailed: "ошибка доставки", privacy: "Не отправляйте паспортные данные или файлы в Telegram. Используйте защищённые документы кабинета.", label: "Сообщение клиенту через Telegram", sending: "Отправляем…", send: "Отправить клиенту", pending: "Сообщение отправляется…", success: "Сообщение поставлено в защищённую очередь Telegram один раз.", error: "Не удалось отправить сообщение. Повторите попытку." },
  en: { title: "Client dialogue", empty: "No messages yet.", loading: "Loading dialogue…", failed: "Could not load the dialogue.", retry: "Retry", retryDelivery: "Retry delivery", retryingDelivery: "Retrying delivery…", retrySuccess: "Delivery was requeued without creating a duplicate.", retryError: "Could not retry delivery. Please try again.", client: "Client", staff: "Manager", queued: "queued", delivered: "delivered", deliveryFailed: "delivery failed", privacy: "Do not send passport details or files in Telegram. Use protected cabinet documents.", label: "Message the client via Telegram", sending: "Sending…", send: "Send to client", pending: "Message is being sent…", success: "Message was queued for protected Telegram delivery once.", error: "Could not send the message. Please try again." },
} as const;

function adminHeaders(csrf: string) { return { "Content-Type": "application/json", "X-CSRF-Token": csrf }; }

function clientListState() {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get("sort") as ClientSort | null;
  const requestedVisaFilter = params.get("visa_filter") ?? "";
  return {
    search: params.get("search") ?? "",
    servicePresence: readServicePresence(params),
    visaFilter: requestedVisaFilter === "archived" ? "" : requestedVisaFilter,
    sort: (["joined_desc", "joined_asc", "name_asc", "name_desc", "activity_desc", "status_asc"] as ClientSort[]).includes(sort ?? "" as ClientSort) ? sort! : "joined_desc" as ClientSort,
  };
}

function clientListUrl(search: string, visaFilter: string, sort: ClientSort, services: ServicePresence) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (visaFilter) params.set("visa_filter", visaFilter);
  if (sort !== "joined_desc") params.set("sort", sort);
  setServicePresence(params, services);
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
    const focusable = () => [...(root?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [href]') ?? [])].filter(node => node.getClientRects().length > 0 && !node.closest('[hidden], [inert]'));
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
    NOT_ISSUED: "В системе SAFRWAY нет подтверждения выдачи визы.", ISSUED_NOT_ACTIVATED: "Выдача подтверждена, активация не отмечена.", ACTIVE: "Виза отмечена активной по подтверждённым менеджером данным.", EXPIRING: "Кейс отмечен как приближающийся к завершению срока по подтверждённым данным.", EXTENSION_PROCESSING: "В SAFRWAY отмечена обработка продления.", EXTENDED: "Продление отмечено завершённым по подтверждённым данным.", EXPIRED: "В системе срок отмечен завершившимся.", REFUSED: "В системе зафиксирован отказ.",
  },
  en: {
    NOT_ISSUED: "SAFRWAY has no confirmed visa issuance record.", ISSUED_NOT_ACTIVATED: "Issuance is confirmed; activation is not recorded.", ACTIVE: "The visa is recorded as active from manager-confirmed data.", EXPIRING: "The case is marked as approaching its confirmed end date.", EXTENSION_PROCESSING: "SAFRWAY records an extension in progress.", EXTENDED: "The extension is recorded as completed from confirmed data.", EXPIRED: "The recorded validity period has ended.", REFUSED: "A refusal is recorded in the system.",
  },
} as const;


function StatusPicker({ label, value, options, locale, onChange, disabled, kind = "service", processType }: { label: string; value: string; options: string[]; locale: "ru" | "en"; onChange: (value: string) => void; disabled: boolean; kind?: StatusKind; processType?: string }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  const currentDescription = kind === "lifecycle" ? statusDescriptions[locale][value as keyof typeof statusDescriptions.ru] ?? (locale === "ru" ? "Системный рабочий статус." : "System workflow status.") : visaStatusDescription(kind, value, locale);
  return <div className="crm-status-picker crm-status-compact">
    <div className="crm-status-label"><label htmlFor={`${helpId}-select`}>{label}</label><button type="button" className="crm-info" aria-expanded={helpOpen} aria-controls={helpId} aria-label={`${label}: ${locale === "ru" ? "справка" : "help"}`} onClick={() => setHelpOpen(!helpOpen)}>i</button></div>
    <select id={`${helpId}-select`} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
      {options.map(code => <option key={code} value={code}>{visaStatusLabel(kind, code, locale, processType)} · {code}</option>)}
    </select>
    {helpOpen && <small id={helpId} className="crm-status-help-copy">{currentDescription}</small>}
  </div>;
}

export function AdminVisaCRM({ csrfToken, initialClientId, locale = "ru", actorRole = "admin" }: { csrfToken: string; initialClientId?: number | null; locale?: "ru" | "en"; actorRole?: string }) {
  const initialList = clientListState();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientTotal, setClientTotal] = useState(0);
  const today = useBaliToday();
  const [types, setTypes] = useState<VisaType[]>([]);
  const [selected, setSelected] = useState<ClientDetail | null>(null);
  const [search, setSearch] = useState(initialList.search);
  const [visaFilter, setVisaFilter] = useState(initialList.visaFilter);
  const [servicePresence, updateServicePresence] = useState(initialList.servicePresence);
  const clientListGeneration = useRef(0);
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
  const [editorError, setEditorError] = useState("");
  const [dateEditorOpened, setDateEditorOpened] = useState(false);
  const saveRequestRef = useRef<{payload: string; key: string} | null>(null);
  const [nextAction, setNextAction] = useState("");
  const [recommendedContact, setRecommendedContact] = useState("");
  const [contactReason, setContactReason] = useState<"VISA_EXPIRY" | "EXTENSION" | "NEW_VISA" | "OTHER" | "">("");
  const [contactInternalNote, setContactInternalNote] = useState("");
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
  const [feedback, setFeedback] = useState("");
  const [managerMessage, setManagerMessage] = useState("");
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");
  const [pendingClientId, setPendingClientId] = useState<number | null>(null);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [managerAssignmentEnabled, setManagerAssignmentEnabled] = useState(false);
  const [assignedManagerId, setAssignedManagerId] = useState(0);
  const [assignmentReason, setAssignmentReason] = useState("");
  const [assignmentConfirm, setAssignmentConfirm] = useState(false);
  const [assignmentMode, setAssignmentMode] = useState<"add" | "revoke">("add");
  const [assignmentTarget, setAssignmentTarget] = useState<CaseAssignment | null>(null);
  const [assignmentFeedback, setAssignmentFeedback] = useState("");
  const [notificationHistory, setNotificationHistory] = useState<NotificationDelivery[]>([]);
  const [notificationState, setNotificationState] = useState<"idle" | "loading" | "error">("idle");
  const [notificationFeedback, setNotificationFeedback] = useState("");
  const [notificationError, setNotificationError] = useState("");
  const [notifySummaryConfirm, setNotifySummaryConfirm] = useState(false);
  const [notifySummaryReason, setNotifySummaryReason] = useState("");
  const [retryNotification, setRetryNotification] = useState<NotificationDelivery | null>(null);
  const [retryNotificationReason, setRetryNotificationReason] = useState("");
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
  const assignmentReturnFocusRef = useRef<HTMLElement | null>(null);
  const assignmentOutcomeRef = useRef<HTMLParagraphElement>(null);
  const notificationReturnFocusRef = useRef<HTMLElement | null>(null);
  const notificationOutcomeRef = useRef<HTMLParagraphElement>(null);
  const listScrollRef = useRef(0);
  const dialogueLocale = locale;
  const chat = dialogueCopy[dialogueLocale];
  const isRootAdmin = actorRole === "admin";
  const ui = (ru: string, en: string) => locale === "ru" ? ru : en;

  useEffect(() => {
    if (assignmentConfirm || !assignmentFeedback) return;
    const frame = window.requestAnimationFrame(() => assignmentOutcomeRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [assignmentConfirm, assignmentFeedback]);

  function returnNotificationFocus() {
    const target = notificationReturnFocusRef.current;
    window.requestAnimationFrame(() => target?.isConnected && target.focus());
  }

  function returnAssignmentFocus() {
    const target = assignmentReturnFocusRef.current;
    window.requestAnimationFrame(() => target?.isConnected && target.focus());
  }

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

  async function loadClients(query = search, filter = visaFilter, nextSort = sort, syncUrl = false, services = servicePresence) {
    const generation = ++clientListGeneration.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      if (filter) params.set("visa_filter", filter);
      params.set("sort", nextSort);
      setServicePresence(params, services);
      const suffix = params.size ? `?${params}` : "";
      const [clientData, typeData, storageData, managerData, staffData] = await Promise.all([
        appApiClient().request<{ items: Client[]; total: number }>(`/api/web/admin/clients${suffix}`),
        appApiClient().request<{ items: VisaType[] }>("/api/web/admin/visa-cases/types"),
        appApiClient().request<DocumentStorageReadiness>("/api/web/admin/visa-cases/document-storage/readiness").catch(() => unavailableDocumentStorage),
        isRootAdmin ? appApiClient().request<{ enabled: boolean; items: Array<{ user_id: number; name: string; role_code: string }> }>("/api/web/admin/visa-cases/staff/visa-managers").catch(() => ({ enabled: false, items: [] })) : Promise.resolve({ enabled: false, items: [] }),
        isRootAdmin ? appApiClient().request<{ items: Array<{ user_id: number; name: string; role_code: string; active: boolean }> }>("/api/web/admin/visa-cases/staff").catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
      ]);
      if (generation !== clientListGeneration.current) return;
      setClients(clientData.items); setClientTotal(clientData.total); setTypes(typeData.items);
      const options = new Map<number, ManagerOption>();
      for (const item of [...managerData.items, ...staffData.items.filter((staff) => staff.active)]) options.set(item.user_id, { id: item.user_id, name: item.name, role: item.role_code });
      setDocumentStorage(storageData); setManagerOptions([...options.values()]); setManagerAssignmentEnabled(managerData.enabled);
      if (syncUrl && !selected) window.history.replaceState({ ...(window.history.state ?? {}), safrClientList: true }, "", clientListUrl(query, filter, nextSort, services));
    } catch (caught) { if (generation === clientListGeneration.current) setError(apiErrorMessage(caught)); }
    finally { if (generation === clientListGeneration.current) setLoading(false); }
  }

  async function openClient(id: number, pushRoute = true) {
    if (pushRoute) {
      listScrollRef.current = window.scrollY;
      window.history.replaceState({ ...(window.history.state ?? {}), safrClientList: true, listScroll: listScrollRef.current }, "", clientListUrl(search, visaFilter, sort, servicePresence));
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
    window.history.replaceState({ safrClientList: true, listScroll: listScrollRef.current }, "", clientListUrl(search, visaFilter, sort, servicePresence));
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
    setEditorError("");
    setDateEditorOpened(visaWasIssued(item.lifecycle_status) || Boolean(item.entry_deadline || item.stay_end));
    saveRequestRef.current = null;
    setSelectedCase(item); setServiceStatus(item.service_status); setLifecycleStatus(item.lifecycle_status);
    setNextAction(item.next_action_text ?? ""); setRecommendedContact(item.recommended_contact_at?.slice(0, 10) ?? "");
    setContactReason(item.contact_reason_code ?? ""); setContactInternalNote(item.contact_internal_note ?? "");
    setEntryDeadline(item.entry_deadline?.slice(0, 10) ?? ""); setStayEnd(item.stay_end?.slice(0, 10) ?? ""); setDateSource(item.date_source ?? "");
    setShowToClient(item.publication_status === "PUBLISHED"); setNotifyClient(false);
    setAssignedManagerId(0); setAssignmentReason(""); setAssignmentConfirm(false); setAssignmentTarget(null); setAssignmentMode("add"); setAssignmentFeedback("");
    setNotifySummaryConfirm(false); setNotifySummaryReason(""); setRetryNotification(null); setRetryNotificationReason(""); setNotificationFeedback(""); setNotificationError("");
    setNotificationHistory(item.deliveries ?? []); void loadNotificationHistory(item.id);
    setDocumentFile(null); setDocumentName(""); setDocumentType("VISA"); setDocumentVisibility("INTERNAL"); setDocumentUploadKey(""); setDocumentState("idle");
    setProcesses((item.processes ?? []).map((process) => ({ id: process.id, process_type: process.type, external_status: process.external_status, raw_external_status: process.raw_external_status, action: "UPSERT" })));
  }

  async function saveCase(event: React.FormEvent | null, notifyClient = false) {
    event?.preventDefault(); if (!selected || !selectedCase || submitting) return;
    setEditorError("");
    if (notifyClient && !canNotifyVisaChange(showToClient, selectedCase.notifications_enabled)) {
      setNotifyClient(false); setEditorError(ui("Уведомление недоступно: виза скрыта или клиент отключил сообщения. Можно сохранить без уведомления.", "Notification unavailable: the visa is hidden or the client opted out. You can save without notifying.")); return;
    }
    let dates;
    try { dates = visaDatePatch(selectedCase, {entry_deadline: entryDeadline, stay_end: stayEnd, date_source: dateSource}); }
    catch {
      setEditorError(ui("Укажите источник подтверждённых дат.", "Choose the source of confirmed dates."));
      const fields = document.getElementById("visa-confirmed-dates");
      fields?.closest("details")?.setAttribute("open", ""); fields?.querySelector("select")?.focus(); return;
    }
    if (recommendedContact && !contactReason) {
      setEditorError(ui("Выберите причину в разделе «План связи».", "Choose a reason in Contact plan."));
      const fields = document.getElementById("contact-plan-title")?.closest("details");
      fields?.setAttribute("open", ""); fields?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus(); return;
    }
    const body: Record<string, unknown> = { service_status: serviceStatus, lifecycle_status: lifecycleStatus, next_action_text: nextAction || null, recommended_contact_at: recommendedContact ? `${recommendedContact}T00:00:00+08:00` : null, contact_reason_code: recommendedContact ? contactReason || null : null, contact_internal_note: recommendedContact ? contactInternalNote.trim() || null : null, processes: visaProcessChanges(selectedCase.processes ?? [], processes), show_to_client: showToClient, reason: "Manual admin aggregate update", expected_version: selectedCase.version, notify_client: notifyClient };
    Object.assign(body, dates);
    const requestPayload = JSON.stringify(body);
    if (saveRequestRef.current?.payload !== requestPayload) saveRequestRef.current = {payload: requestPayload, key: crypto.randomUUID()};
    body.idempotency_key = saveRequestRef.current.key;
    setSubmitting(notifyClient ? "save-notify" : "save"); setError("");
    try { await appApiClient().request(`/api/web/admin/visa-cases/${selectedCase.id}/aggregate`, { method: "PATCH", headers: adminHeaders(csrfToken), body: JSON.stringify(body) }); setSelectedCase(null); setFeedback(dialogueLocale === "ru" ? (notifyClient ? "Все изменения сохранены. Создано ровно одно уведомление CASE_UPDATED." : "Все изменения сохранены без уведомления клиента.") : (notifyClient ? "All changes were saved. Exactly one CASE_UPDATED notification was created." : "All changes were saved without notifying the client.")); await openClient(selected.client.id); }
    catch { setEditorError(ui("Не удалось подтвердить сохранение. Проверьте соединение, допустимость перехода статуса и актуальность карточки.", "Could not confirm the save. Check the connection, permitted status transition and card version.")); }
    finally { setSubmitting(""); }
  }

  async function publication(action: "publish" | "hide" | "archive") {
    if (!selected || !selectedCase || submitting) return;
    setSubmitting(`publication-${action}`); setError("");
    try { await appApiClient().request(`/api/web/admin/visa-cases/${selectedCase.id}/publication/${action}`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ notify_client: action === "publish", reason: `Manual ${action}`, idempotency_key: crypto.randomUUID() }) }); setPublicationConfirm(null); setSelectedCase(null); setFeedback(action === "publish" ? ui("Кейс опубликован; уведомление поставлено в очередь один раз.", "The case was published; one notification was queued.") : action === "hide" ? ui("Кейс скрыт от клиента.", "The case was hidden from the client.") : ui("Кейс архивирован и скрыт от клиента.", "The case was archived and hidden from the client.")); await openClient(selected.client.id); }
    catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(""); }
  }

  function mergeUpdatedCase(updated: Case) {
    setSelectedCase(updated);
    setSelected((current) => current ? { ...current, visa_cases: current.visa_cases.map((item) => item.id === updated.id ? updated : item) } : current);
  }

  async function refreshCase(caseId: number) {
    const updated = await appApiClient().request<Case>(`/api/web/admin/visa-cases/${caseId}`);
    mergeUpdatedCase(updated);
    return updated;
  }

  async function loadNotificationHistory(caseId: number) {
    setNotificationState("loading");
    try {
      const result = await appApiClient().request<{ items: NotificationDelivery[] }>(`/api/web/admin/visa-cases/${caseId}/notification-history`);
      setNotificationHistory(result.items); setNotificationState("idle");
    } catch { setNotificationState("error"); }
  }

  async function changeCaseAssignment() {
    if (!selectedCase || !isRootAdmin || !managerAssignmentEnabled || assignmentReason.trim().length < 3 || submitting) return;
    if (assignmentMode === "add" && !assignedManagerId) return;
    if (assignmentMode === "revoke" && !assignmentTarget) return;
    setSubmitting("assignment"); setError(""); setAssignmentFeedback("");
    try {
      const path = assignmentMode === "add" ? `/api/web/admin/visa-cases/${selectedCase.id}/assignments` : `/api/web/admin/visa-cases/${selectedCase.id}/assignments/${assignmentTarget!.id}/revoke`;
      const body = assignmentMode === "add"
        ? { staff_user_id: assignedManagerId, expected_version: selectedCase.version, reason: assignmentReason.trim(), idempotency_key: crypto.randomUUID(), make_primary: false }
        : { expected_version: selectedCase.version, reason: assignmentReason.trim(), idempotency_key: crypto.randomUUID() };
      await appApiClient().request(path, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify(body) });
      const updated = await refreshCase(selectedCase.id);
      setAssignmentReason(""); setAssignmentConfirm(false); setAssignmentTarget(null); setAssignedManagerId(0);
      setAssignmentFeedback(assignmentMode === "add" ? ui("Менеджер добавлен к визе. Доступ уже действует.", "The manager was added to the visa and access is active now.") : ui("Назначение отозвано. Доступ сотрудника прекращён немедленно.", "The assignment was revoked and staff access ended immediately."));
      setAssignmentMode("add");
      setRecommendedContact(updated.recommended_contact_at?.slice(0, 10) ?? "");
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(""); }
  }

  async function sendStatusSummary() {
    if (!selectedCase || !isRootAdmin || notifySummaryReason.trim().length < 3 || submitting) return;
    setSubmitting("manual-notify"); setError(""); setNotificationError(""); setNotificationFeedback("");
    try {
      const result = await appApiClient().request<NotificationDelivery>(`/api/web/admin/visa-cases/${selectedCase.id}/notifications/status-summary`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ confirm_case_id: selectedCase.id, expected_version: selectedCase.version, reason: notifySummaryReason.trim(), idempotency_key: crypto.randomUUID() }) });
      setNotifySummaryConfirm(false); setNotifySummaryReason(""); returnNotificationFocus();
      setNotificationFeedback(ui(`Сводка поставлена в очередь. Текущий результат: ${result.state_label}.`, `The summary was queued. Current outcome: ${result.state_label}.`));
      await loadNotificationHistory(selectedCase.id);
      window.requestAnimationFrame(() => notificationOutcomeRef.current?.focus());
    } catch (caught) { setNotificationError(apiErrorMessage(caught)); }
    finally { setSubmitting(""); }
  }

  async function retryStatusDelivery() {
    if (!selectedCase || !retryNotification || retryNotificationReason.trim().length < 3 || submitting) return;
    setSubmitting(`notification-retry-${retryNotification.delivery_id}`); setError(""); setNotificationError(""); setNotificationFeedback("");
    try {
      const result = await appApiClient().request<NotificationDelivery>(`/api/web/admin/visa-cases/${selectedCase.id}/deliveries/${retryNotification.delivery_id}/retry`, { method: "POST", headers: adminHeaders(csrfToken), body: JSON.stringify({ confirm_delivery_id: retryNotification.delivery_id, reason: retryNotificationReason.trim(), idempotency_key: crypto.randomUUID() }) });
      setRetryNotification(null); setRetryNotificationReason(""); returnNotificationFocus();
      setNotificationFeedback(ui(`Повтор разрешён и поставлен в очередь. Текущий результат: ${result.state_label}.`, `The retry was allowed and queued. Current outcome: ${result.state_label}.`));
      await loadNotificationHistory(selectedCase.id);
      window.requestAnimationFrame(() => notificationOutcomeRef.current?.focus());
    } catch (caught) { setNotificationError(apiErrorMessage(caught)); }
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

  function changeClientVisibility(visible: boolean) {
    const next = visaVisibilityPreferences(visible, notifyClient);
    setShowToClient(next.showToClient); setNotifyClient(next.notifyClient);
  }

  function changeLifecycleStatus(status: string) {
    setLifecycleStatus(status);
    if (visaWasIssued(status)) setDateEditorOpened(true);
  }

  function updateStagedProcess(index: number, values: Partial<ProcessDraft>) {
    setProcesses((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  }

  function removeStagedProcess(index: number) {
    setProcesses((current) => current.flatMap((item, itemIndex) => itemIndex !== index ? [item] : item.id ? [{ ...item, action: "REMOVE" as const }] : []));
  }

  const mainProcess = processes[mainVisaProcessIndex(processes)];
  const issued = visaWasIssued(lifecycleStatus);
  const confirmedDates = <div className="crm-confirmed-dates" id="visa-confirmed-dates">
    <div className="crm-editor-grid">
      <label>{ui("Въехать до", "Enter by")}<input disabled={!!submitting} type="date" value={entryDeadline} onChange={event => setEntryDeadline(event.target.value)} /></label>
      <label>{ui("Разрешено находиться до", "Permitted stay until")}<input disabled={!!submitting} type="date" value={stayEnd} onChange={event => setStayEnd(event.target.value)} /></label>
    </div>
    {(entryDeadline || stayEnd) && <label>{ui("Источник подтверждённых дат", "Confirmed dates source")}<select disabled={!!submitting} value={dateSource} onChange={event => setDateSource(event.target.value)}>
      <option value="">{ui("Выберите источник для новых дат", "Choose the source for new dates")}</option>
      <option value="BOSS_ADMIN">{ui("Главный администратор", "Root administrator")}</option><option value="VISA_ADMIN">{ui("Визовый менеджер", "Visa manager")}</option><option value="IMMIGRATION">{ui("Документы иммиграции", "Immigration documents")}</option>
      {dateSource && !["BOSS_ADMIN","VISA_ADMIN","IMMIGRATION"].includes(dateSource) && <option value={dateSource}>{ui("Ранее сохранённый источник", "Previously saved source")}</option>}
    </select></label>}
  </div>;
  const displayedVisaCases = selected ? selected.visa_cases.filter((item) => item.publication_status !== "ARCHIVED") : [];


  if (!selected && detailState !== "idle") return <section className="admin-panel crm-client-card" aria-live="polite">
    <button className="admin-back" onClick={() => showClientList()}>← {locale === "ru" ? "Все клиенты" : "All clients"}</button>
    {detailState === "loading" ? <div className="admin-empty" role="status">{chat.loading}</div> : <div className="admin-empty" role="alert"><p>{chat.failed}</p><button className="button secondary" onClick={() => pendingClientId && void openClient(pendingClientId)}>{chat.retry}</button></div>}
  </section>;

  if (selected) return <section className="admin-panel crm-client-card">
    <button className="admin-back" onClick={() => showClientList()}>← {locale === "ru" ? "Все клиенты" : "All clients"}</button>
    {selected.client.username && /^[A-Za-z0-9_]{5,32}$/.test(selected.client.username.replace(/^@/, "")) && <a className="crm-telegram-link" href={`https://t.me/${selected.client.username.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">{ui("Открыть профиль и диалог в Telegram ↗", "Open Telegram profile and chat ↗")}</a>}
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {feedback && <div className={feedback.startsWith(ui("Доступ недоступен", "Access unavailable")) ? "admin-alert" : "admin-outcome"} role="status" aria-live="polite">{feedback}</div>}
    <header id="client-overview" tabIndex={-1} className="crm-client-head"><div><span className="eyebrow">SAFRWAY ID {selected.client.id}</span><h2>{[selected.client.first_name, selected.client.last_name].filter(Boolean).join(" ") || selected.client.username || ui("Клиент", "Client")}</h2><p>{selected.client.telegram_id_mask} · {selected.client.bot_status}</p>{isRootAdmin && <form className="crm-tag-form" onSubmit={addTag}><input aria-label={ui("Новый внутренний тег", "New internal tag")} placeholder={ui("Добавить тег", "Add tag")} value={tag} onChange={(event) => setTag(event.target.value)} /><button disabled={!tag.trim()}>{ui("Добавить", "Add")}</button></form>}</div><button className="button primary" onClick={() => setCreateOpen(true)}>+ {ui("Добавить визу", "Add visa")}</button></header>
    {isRootAdmin && <a className="button secondary admin-client-preview-link" href={`/admin/clients/${selected.client.id}/preview/`}>{ui("Посмотреть глазами клиента", "View as client")} →</a>}
    <nav className="crm-tabs" aria-label={ui("Разделы карточки клиента", "Client profile sections")}><a href="#client-overview">{ui("Обзор", "Overview")}</a><a href="#client-visas">{ui("Визы", "Visas")}</a>{actorRole === "admin" && <a href="#client-services">{ui("Услуги", "Services")}</a>}<a href="#client-chat">{ui("Диалог", "Dialogue")}</a>{isRootAdmin && <><a href="#client-notes">{ui("Заметки", "Notes")}</a><a href="#client-access" onClick={() => { const panel = document.getElementById("client-access"); if (panel instanceof HTMLDetailsElement) panel.open = true; }}>{ui("Доступы", "Access")}</a></>}</nav>
    {actorRole === "admin" && <AdminLifeServices key={selected.client.id} userId={selected.client.id} csrfToken={csrfToken} locale={locale} />}
    <section id="client-visas" tabIndex={-1}><h3>{ui("Визы", "Visas")}</h3>{displayedVisaCases.length ? <div className="admin-life-tiles admin-visa-tiles">{displayedVisaCases.map((item) => {
      const date = visaDatePresentation(item, locale);
      const terminal = ["EXPIRED", "CANCELLED", "REFUSED"].includes(item.lifecycle_status);
      const start = item.entered_on || (date?.value === item.entry_deadline ? item.issued_on : null);
      const visibility = item.publication_status === "PUBLISHED" ? ui("В кабинете клиента", "In client account") : item.publication_status === "DRAFT" ? ui("Черновик", "Draft") : ui("Скрыто", "Hidden");
      return <button type="button" key={item.id} onClick={() => editCase(item)}>
        <span className="admin-life-tile-top"><span className="admin-life-tile-icon"><AppIcon name="▣"/></span><span className="admin-life-tile-status">{visibility}</span></span>
        <span className="admin-service-tile-main"><span className="admin-life-tile-copy"><small>{ui("Виза · Индонезия", "Visa · Indonesia")}</small><strong>{item.custom_visa_name || item.visa_type.name || item.visa_type.code}</strong><small className="admin-visa-state">{visaStatusLabel("lifecycle", item.lifecycle_status, locale)}</small></span><AdminServiceCountdown start={start} end={date?.value?.slice(0, 10) ?? null} today={today} locale={locale} terminal={terminal} estimated={date?.estimated}/></span>
        <span className="admin-life-tile-date">{date ? <><small>{date.label}</small><time dateTime={date.value}>{formatLifeDate(date.value.slice(0, 10), locale)}</time></> : <small>{ui("Дата уточняется", "Date to be confirmed")}</small>}{item.next_action_text && <span className="admin-visa-next-action">{item.next_action_text}</span>}</span>
      </button>;
    })}</div> : <div className="admin-empty">{ui("Визовых кейсов пока нет.", "No visa cases yet.")}</div>}</section>
    <section className={`crm-split${isRootAdmin ? "" : " is-single"}`}><div id="client-chat" tabIndex={-1}><h3>{chat.title}</h3>{selected.dialogue?.messages?.filter((item) => item.visibility === "client").length ? <ol ref={dialogueLogRef} className="chat-messages" role="log" aria-label={chat.title} aria-live="polite" aria-relevant="additions text">{selected.dialogue.messages.filter((item) => item.visibility === "client").map((item) => { const delivery = item.delivery_status === "failed" ? chat.deliveryFailed : item.delivery_status === "delivered" ? chat.delivered : chat.queued; return <li ref={(node) => { if (node) messageNodeRefs.current.set(item.id, node); else messageNodeRefs.current.delete(item.id); }} tabIndex={-1} className={item.author_type === "client" ? "chat-message from-client" : "chat-message from-staff"} key={item.id}><span>{item.author_type === "client" ? chat.client : `${chat.staff} · ${delivery}`}</span><time dateTime={item.created_at}>{new Intl.DateTimeFormat(dialogueLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time><p>{item.body}</p>{item.author_type === "staff" && item.delivery_status === "failed" && <button type="button" disabled={!!submitting} onClick={() => void retryDelivery(item.id)}>{submitting === `retry-${item.id}` ? chat.retryingDelivery : chat.retryDelivery}</button>}</li>; })}</ol> : <div className="admin-empty">{chat.empty}</div>}<form className="chat-form" onSubmit={sendManagerMessage}><p className="admin-risk">{chat.privacy}</p><label>{chat.label}<textarea ref={messageFieldRef} disabled={!!submitting} value={managerMessage} onChange={(event) => setManagerMessage(event.target.value)} /></label><button className="button primary" disabled={!managerMessage.trim() || !!submitting}>{submitting === "manager-message" ? chat.sending : chat.send}</button></form></div>{isRootAdmin && <div id="client-notes" tabIndex={-1}><h3>{ui("Внутренние заметки", "Internal notes")}</h3>{selected.notes.map((item) => <article className="crm-note" key={item.id}>{item.pinned && <strong>{ui("Закреплено", "Pinned")}</strong>}<p>{item.body}</p></article>)}<form onSubmit={addNote}><label>{ui("Новая заметка", "New note")}<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label><button className="button secondary" disabled={!note.trim()}>{ui("Добавить", "Add")}</button></form></div>}</section>
    {isRootAdmin && <details id="client-access" tabIndex={-1} className="crm-advanced crm-immigration-access"><summary>{ui("Добавить ЛК иммиграции", "Add immigration account")}</summary><div className="crm-advanced-body"><p className="admin-risk">{ui("Только учётная запись сайта иммиграции. Значения зашифрованы, автоматически скрываются через 20 секунд, каждое открытие и копирование аудируется.", "Immigration website account only. Values are encrypted, hidden automatically after 20 seconds, and every reveal or copy is audited.")}</p>{selected.credentials.map((item) => <article className="crm-note" key={item.id}><strong>{item.provider}</strong>{item.service_url && <a href={item.service_url} target="_blank" rel="noreferrer">{ui("Открыть сайт", "Open website")}</a>}<p>{revealedCredential?.id === item.id ? `${revealedCredential.login ?? ""} · ${revealedCredential.secret}` : item.login_mask || ui("Логин скрыт", "Login hidden")}</p><div>{revealedCredential?.id === item.id ? <button type="button" onClick={() => { setRevealedCredential(null); setFeedback(ui("Доступ снова скрыт.", "Access is hidden again.")); }}>{ui("Скрыть сейчас", "Hide now")}</button> : <button type="button" disabled={!!submitting} onClick={() => void accessCredential(item.id, "REVEAL")}>{submitting === "credential-reveal" ? ui("Открываем…", "Revealing…") : ui("Показать", "Reveal")}</button>}<button type="button" disabled={!!submitting} onClick={() => void accessCredential(item.id, "COPY")}>{submitting === "credential-copy" ? ui("Копируем…", "Copying…") : ui("Копировать", "Copy")}</button></div></article>)}<form onSubmit={addCredential}><label>{ui("Сайт иммиграции", "Immigration website")}<input type="url" placeholder="https://…" value={credentialUrl} onChange={(event) => setCredentialUrl(event.target.value)} /></label><label>{ui("Email или логин", "Email or login")}<input autoComplete="off" required value={credentialLogin} onChange={(event) => setCredentialLogin(event.target.value)} /></label><label>{ui("Пароль", "Password")}<input type="password" autoComplete="new-password" required value={credentialSecret} onChange={(event) => setCredentialSecret(event.target.value)} /></label><button className="button secondary" disabled={!credentialLogin || !credentialSecret}>{ui("Сохранить зашифрованно", "Save encrypted")}</button></form></div></details>}
    {createOpen && <Dialog labelledBy="visa-create-title" onClose={() => setCreateOpen(false)}><form onSubmit={createCase}><span className="eyebrow">{ui("Ручной режим", "Manual mode")}</span><h2 id="visa-create-title">{ui("Новая виза", "New visa")}</h2><label>{ui("Страна", "Country")}<input value={ui("Индонезия", "Indonesia")} disabled /></label><label>{ui("Тип визы", "Visa type")}<select required value={visaTypeId} onChange={(event) => setVisaTypeId(event.target.value)}><option value="">{ui("Выберите", "Select")}</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}{type.rules_verified ? "" : ` · ${ui("ручные даты", "manual dates")}`}</option>)}</select></label>{types.find((type) => type.id === Number(visaTypeId))?.code === "OTHER" && <label>{ui("Название визы", "Visa name")}<input required value={customName} onChange={(event) => setCustomName(event.target.value)} /></label>}<p>{ui("Кейс будет сохранён как черновик и не появится у клиента до явной публикации.", "The case will be saved as a draft and will not appear to the client until it is explicitly published.")}</p><div><button type="button" onClick={() => setCreateOpen(false)}>{ui("Отмена", "Cancel")}</button><button className="button primary">{ui("Сохранить черновик", "Save draft")}</button></div></form></Dialog>}
    {selectedCase && <Dialog labelledBy="visa-edit-title" onClose={() => { if (!submitting) setSelectedCase(null); }}><div className="crm-visa-editor">
      <div className="crm-editor-title"><div><span className="eyebrow">{selectedCase.publication_status} · v{selectedCase.version}</span><h2 id="visa-edit-title">{ui("Редактировать визу", "Edit visa")}</h2></div><div className="crm-editor-tools"><details className="crm-overflow"><summary aria-label={ui("Дополнительные действия", "Additional actions")}>•••</summary><button disabled={!!submitting} type="button" onClick={() => changeClientVisibility(false)}>{ui("Скрыть после сохранения", "Hide after saving")}</button><button disabled={!!submitting} type="button" onClick={() => setPublicationConfirm("archive")}>{ui("Переместить в архив", "Move to archive")}</button></details><button className="crm-delete-x" disabled={!!submitting} type="button" aria-label={dialogueLocale === "ru" ? "Закрыть редактор" : "Close editor"} title={dialogueLocale === "ru" ? "Закрыть" : "Close"} onClick={() => setSelectedCase(null)}>×</button></div></div>
      <div className="crm-editor-grid crm-editor-primary">
        <StatusPicker label={ui("Работа SAFRWAY и оплата клиента", "SAFRWAY work and client payment")} value={serviceStatus} options={visaStatusOptions("service")} locale={dialogueLocale} onChange={setServiceStatus} disabled={!!submitting} />
        <StatusPicker label={mainProcess && mainProcess.process_type !== "APPLICATION" ? ui(`Этап процесса · ${mainProcess.process_type}`, `Process stage · ${mainProcess.process_type}`) : ui("Иммиграция · подача и рассмотрение", "Immigration · submission and review")} value={mainProcess?.external_status ?? "UNKNOWN"} options={visaStatusOptions("external")} locale={dialogueLocale} kind="external" processType={mainProcess?.process_type ?? "APPLICATION"} onChange={value => setProcesses(current => setMainVisaProcess(current, value))} disabled={!!submitting} />
      </div>
      {isAwaitingVisaIssuance(serviceStatus, lifecycleStatus, mainProcess) && <p className="crm-workflow-summary">{ui("Внешний процесс: ожидаем выдачу документа", "External process: awaiting document issuance")}</p>}
      <label className="crm-toggle crm-issued-switch"><input type="checkbox" checked={issued} disabled={!!submitting || !canToggleVisaIssued(lifecycleStatus)} aria-controls="visa-confirmed-dates" onChange={event => changeLifecycleStatus(toggleVisaIssued(lifecycleStatus, event.target.checked))} /><span><strong>{ui("Виза выдана", "Visa issued")}</strong>{!canToggleVisaIssued(lifecycleStatus) && <small>{visaStatusLabel("lifecycle", lifecycleStatus, dialogueLocale)}</small>}</span></label>
      {issued ? confirmedDates : keepVisaDateEditor(selectedCase, dateEditorOpened, {entry_deadline: entryDeadline, stay_end: stayEnd}) ? <details className="crm-advanced"><summary>{ui("Ранее сохранённые даты", "Previously saved dates")}</summary>{confirmedDates}</details> : null}
      <details className="crm-advanced"><summary>{ui("Состояние визы и следующее действие", "Visa state and next action")}</summary><div className="crm-editor-grid">
        <StatusPicker label={ui("Состояние визы", "Visa state")} value={lifecycleStatus} options={["NOT_ISSUED","ISSUED_NOT_ACTIVATED","ACTIVE","EXPIRING","EXTENSION_PROCESSING","EXTENDED","EXPIRED","CANCELLED","REFUSED"]} kind="lifecycle" locale={dialogueLocale} onChange={changeLifecycleStatus} disabled={!!submitting} />
        <label>{ui("Следующее действие", "Next action")}<textarea disabled={!!submitting} rows={2} value={nextAction} onChange={event => setNextAction(event.target.value)} /></label>
      </div></details>
      <details className="crm-advanced crm-contact-details"><summary>{ui("План связи", "Contact plan")}{recommendedContact ? ` · ${recommendedContact}` : ""}</summary><section className="crm-contact-plan" aria-labelledby="contact-plan-title"><div><h3 id="contact-plan-title">{ui("План связи", "Contact plan")}</h3><small>{ui("По наступлении даты сотрудникам будет поставлено напоминание; клиенту — только если уведомления этой визы включены.", "When the date is due, staff receive a reminder; the client receives one only when notifications for this visa are enabled.")}</small></div><label>{ui("Рекомендуемая дата связи", "Recommended contact date")}<input disabled={!!submitting} type="date" value={recommendedContact} onChange={(event) => { const value = event.target.value; setRecommendedContact(value); if (!value) { setContactReason(""); setContactInternalNote(""); } }} /></label><fieldset disabled={!!submitting || !recommendedContact}><legend>{ui("Причина связи", "Contact reason")}</legend><div className="crm-reason-buttons" role="radiogroup" aria-label={ui("Причина связи", "Contact reason")}>{([['VISA_EXPIRY', ui('Окончание визы', 'Visa expiry')],['EXTENSION', ui('Продление', 'Extension')],['NEW_VISA', ui('Новая виза', 'New visa')],['OTHER', ui('Другое', 'Other')]] as const).map(([code,label]) => <button type="button" role="radio" aria-checked={contactReason === code} key={code} onClick={() => setContactReason(code)}>{label}</button>)}</div></fieldset><label>{ui("Внутренняя заметка", "Internal note")}<textarea disabled={!!submitting || !recommendedContact} value={contactInternalNote} onChange={(event) => setContactInternalNote(event.target.value)} placeholder={ui("Не отправляется клиенту", "Not sent to the client")} /></label></section></details>
      <details className="crm-advanced"><summary>{ui("Все процессы и номера заявок", "All processes and references")}</summary><fieldset disabled={!!submitting}><legend className="sr-only">{ui("Ручные процессы", "Manual processes")}</legend>{processes.map((process, index) => process.action === "REMOVE" ? <div className="crm-process-row is-removed" key={process.id ?? index}><span>{process.process_type} · {process.external_status}</span><button type="button" onClick={() => updateStagedProcess(index, { action: "UPSERT" })}>{ui("Вернуть", "Restore")}</button></div> : <div className="crm-process-row" key={process.id ?? `new-${index}`}><label>{ui("Тип процесса", "Process type")}<select value={process.process_type} onChange={(event) => updateStagedProcess(index, { process_type: event.target.value })}>{["APPLICATION","EXTENSION","BRIDGING","CONVERSION","RE_ENTRY","CANCELLATION"].map((item) => <option key={item}>{item}</option>)}</select></label><StatusPicker kind="external" processType={process.process_type} label={`${ui("Внешний статус", "External status")} ${index + 1}`} value={process.external_status} options={visaStatusOptions("external")} locale={dialogueLocale} onChange={(value) => updateStagedProcess(index, { external_status: value })} disabled={!!submitting} /><label>{ui("Оригинальный статус иммиграции", "Original immigration status")}<input maxLength={1000} value={process.raw_external_status ?? ""} onChange={event => updateStagedProcess(index, { raw_external_status: event.target.value })} /></label><label>{ui("Номер заявки / дела", "Application / case number")}<input value={process.reference ?? ""} onChange={(event) => updateStagedProcess(index, { reference: event.target.value })} /></label><button type="button" onClick={() => removeStagedProcess(index)}>{ui("Убрать процесс", "Remove process")}</button></div>)}<button type="button" onClick={addStagedProcess}>+ {ui("Добавить процесс вручную", "Add process manually")}</button></fieldset></details>
      <details className="crm-advanced crm-assignment"><summary>{locale === "ru" ? "Ответственные сотрудники" : "Assigned staff"} ({selectedCase.assignments?.length ?? 0})</summary><div className="crm-advanced-body">{assignmentFeedback && <p ref={assignmentOutcomeRef} tabIndex={-1} className="admin-outcome" role="status">{assignmentFeedback}</p>}<ul className="crm-assignment-list">{selectedCase.assignments?.length ? selectedCase.assignments.map((assignment) => <li key={assignment.id}><span><strong>{assignment.name}</strong><small>{assignment.primary ? ui("Основной ответственный", "Primary assignee") : ui("Дополнительный ответственный", "Additional assignee")}</small></span>{isRootAdmin && <button type="button" className="danger" disabled={!!submitting} onClick={(event) => { assignmentReturnFocusRef.current = event.currentTarget; setAssignmentMode("revoke"); setAssignmentTarget(assignment); setAssignmentReason(""); setAssignmentConfirm(true); }}>{ui("Отозвать", "Revoke")}</button>}</li>) : <li className="admin-empty">{ui("Назначений пока нет.", "No assignments yet.")}</li>}</ul>{isRootAdmin && <><label>{locale === "ru" ? "Добавить сотрудника" : "Add staff member"}<select disabled={!managerAssignmentEnabled || !!submitting} value={assignedManagerId} onChange={(event) => setAssignedManagerId(Number(event.target.value))}><option value="0">—</option>{managerOptions.filter((manager) => !selectedCase.assignments?.some((assignment) => assignment.staff_user_id === manager.id)).map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.role === "visa_manager" ? ui("Визовый менеджер", "Visa manager") : manager.role === "general_manager" ? ui("Менеджер", "General manager") : ui("Главный администратор", "Root admin")}</option>)}</select></label><label>{locale === "ru" ? "Причина назначения" : "Assignment reason"}<input disabled={!managerAssignmentEnabled || !!submitting} value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} /></label><button type="button" disabled={!managerAssignmentEnabled || !!submitting || !assignedManagerId || assignmentReason.trim().length < 3} onClick={(event) => { assignmentReturnFocusRef.current = event.currentTarget; setAssignmentMode("add"); setAssignmentTarget(null); setAssignmentConfirm(true); }}>{locale === "ru" ? "Проверить назначение" : "Review assignment"}</button>{!managerAssignmentEnabled && <p className="admin-risk">{locale === "ru" ? "Кабинет визового менеджера выключен feature flag и остаётся deny-by-default." : "The visa-manager cabinet is feature-flagged off and remains deny-by-default."}</p>}</>}</div></details>
      <details className="crm-advanced"><summary>{ui("История уведомлений и ручная отправка", "Notification history and manual send")}</summary><section className="crm-notifications" aria-labelledby="visa-notifications-title"><div className="crm-section-head"><div><h3 id="visa-notifications-title">{ui("Уведомления по визе", "Visa notifications")}</h3><small>{ui("История показывает постановку в очередь и фактический результат отдельно.", "History separates queueing from the actual delivery outcome.")}</small></div>{isRootAdmin && <button type="button" className="button primary" disabled={!!submitting || selectedCase.publication_status !== "PUBLISHED" || selectedCase.notifications_enabled === false} onClick={(event) => { notificationReturnFocusRef.current = event.currentTarget; setNotifySummaryReason(""); setNotifySummaryConfirm(true); }}>{ui("Уведомить", "Notify")}</button>}</div>{notificationFeedback && <p ref={notificationOutcomeRef} tabIndex={-1} className="admin-outcome" role="status" aria-live="polite">{notificationFeedback}</p>}{notificationError && <p className="admin-alert" role="alert">{notificationError}</p>}{selectedCase.publication_status !== "PUBLISHED" && <p className="admin-risk">{ui("Ручную сводку можно отправить только по опубликованной визе.", "A manual summary can be sent only for a published visa.")}</p>}{selectedCase.notifications_enabled === false && <p className="admin-risk">{ui("Клиент отключил уведомления по этой визе. Ручная отправка заблокирована.", "The client disabled notifications for this visa. Manual notification is blocked.")}</p>}{notificationState === "loading" ? <div className="admin-empty" role="status">{ui("Загружаем историю уведомлений…", "Loading notification history…")}</div> : notificationState === "error" ? <div className="admin-empty" role="alert"><p>{ui("Не удалось загрузить историю.", "Could not load notification history.")}</p><button type="button" onClick={() => void loadNotificationHistory(selectedCase.id)}>{ui("Повторить", "Retry")}</button></div> : notificationHistory.length ? <ol className="crm-notification-history" aria-label={ui("История уведомлений", "Notification history")}>{notificationHistory.map((delivery) => <li key={delivery.delivery_id}><div><strong>{delivery.type_label}</strong><span>{delivery.audience_label}</span></div><dl><div><dt>{ui("Результат", "Outcome")}</dt><dd data-state={delivery.state}>{delivery.state_label}</dd></div><div><dt>{ui("Время", "Time")}</dt><dd><time dateTime={delivery.created_at}>{new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(delivery.created_at))}</time></dd></div></dl>{delivery.error_label && <p className="admin-risk">{delivery.error_label}</p>}{delivery.manual_review_required && <p className="admin-risk">{ui("Результат неизвестен: нужна ручная проверка. Повтор запрещён, чтобы не отправить дубликат.", "Outcome unknown: manual review is required. Retry is blocked to avoid a duplicate.")}</p>}{isRootAdmin && delivery.retry_allowed && <button type="button" disabled={!!submitting} onClick={(event) => { notificationReturnFocusRef.current = event.currentTarget; setRetryNotificationReason(""); setRetryNotification(delivery); }}>{ui("Повторить доставку", "Retry delivery")}</button>}</li>)}</ol> : <div className="admin-empty">{ui("Уведомлений по этой визе пока нет.", "No notifications for this visa yet.")}</div>}</section></details>
      <details className="crm-advanced"><summary>{ui("Документы", "Documents")} ({selectedCase.documents?.length ?? 0})</summary><section className="crm-documents" aria-labelledby="protected-documents-title"><div><h3 id="protected-documents-title">{locale === "ru" ? "Защищённые документы" : "Protected documents"}</h3><span className={documentStorage?.ready ? "admin-outcome" : "admin-risk"}>{documentStorage?.ready ? (locale === "ru" ? "Хранилище, ключ, сканер, retention и restore-proof готовы" : "Storage, key, scanner, retention, and restore proof are ready") : (locale === "ru" ? "Загрузка заблокирована до полной защищённой настройки" : "Upload is blocked until protected configuration is complete")}</span></div>{selectedCase.documents?.length ? <ul className="crm-document-list">{selectedCase.documents.map((document) => <li key={document.id}><div><strong>{document.name}</strong><small>{document.type} · {document.visibility === "CLIENT" ? (locale === "ru" ? "видит клиент" : "client visible") : (locale === "ru" ? "только команда" : "staff only")}{document.archived ? ` · ${locale === "ru" ? "архив" : "archived"}` : ""}</small></div>{document.download_url ? <a className="button secondary" href={document.download_url}>{locale === "ru" ? "Скачать защищённо" : "Secure download"}</a> : <span className="admin-risk">{locale === "ru" ? "Недоступен: нет подтверждённой защищённой загрузки" : "Unavailable: no verified protected upload"}</span>}</li>)}</ul> : <div className="admin-empty">{locale === "ru" ? "Документов пока нет." : "No documents yet."}</div>}<form className="crm-document-upload" onSubmit={uploadProtectedDocument}><label>{locale === "ru" ? "Файл PDF, PNG или JPEG" : "PDF, PNG, or JPEG file"}<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={!documentStorage?.ready || !!submitting} onChange={(event) => { const file = event.target.files?.[0] ?? null; setDocumentFile(file); setDocumentName(file?.name ?? ""); setDocumentUploadKey(crypto.randomUUID()); setDocumentState("idle"); }} /></label><label>{locale === "ru" ? "Название для клиента/команды" : "Display name"}<input disabled={!documentStorage?.ready || !!submitting} value={documentName} onChange={(event) => setDocumentName(event.target.value)} /></label><div className="crm-editor-grid"><label>{locale === "ru" ? "Категория" : "Category"}<select disabled={!documentStorage?.ready || !!submitting} value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="VISA">Visa</option><option value="PASSPORT">Passport</option><option value="IMMIGRATION_NOTICE">Immigration notice</option><option value="OTHER">Other</option></select></label><label>{locale === "ru" ? "Видимость" : "Visibility"}<select disabled={!documentStorage?.ready || !!submitting} value={documentVisibility} onChange={(event) => setDocumentVisibility(event.target.value as "CLIENT" | "INTERNAL")}><option value="INTERNAL">{locale === "ru" ? "Только команда" : "Staff only"}</option><option value="CLIENT">{locale === "ru" ? "Клиенту в кабинете" : "Client cabinet"}</option></select></label></div><button className="button secondary" disabled={!documentStorage?.ready || !documentFile || !documentName.trim() || !!submitting}>{submitting === "document-upload" ? (locale === "ru" ? "Карантин → сканирование → шифрование…" : "Quarantine → scan → encrypt…") : documentState === "rejected" || documentState === "error" ? (locale === "ru" ? "Повторить загрузку" : "Retry upload") : (locale === "ru" ? "Проверить и загрузить" : "Scan and upload")}</button><div aria-live="polite" role="status">{documentState === "pending" ? (locale === "ru" ? "Файл находится в карантине и проверяется. Не закрывайте редактор." : "The file is quarantined and being scanned. Keep the editor open.") : documentState === "accepted" ? (locale === "ru" ? "Файл принят, зашифрован и доступен по выбранной видимости." : "The file was accepted, encrypted, and follows the selected visibility.") : documentState === "rejected" ? (locale === "ru" ? "Файл отклонён; карантинная копия удалена. Выберите исправленный файл и повторите." : "The file was rejected; the quarantined copy was removed. Choose a corrected file and retry.") : documentState === "error" ? (locale === "ru" ? "Загрузка не завершена и ничего не опубликовано. Можно повторить безопасно." : "Upload did not complete and nothing was published. It is safe to retry.") : ""}</div></form></section></details>
      <div className="crm-save-preferences">
        <label className="crm-toggle"><input type="checkbox" checked={showToClient} disabled={!!submitting} onChange={event => changeClientVisibility(event.target.checked)} /><span><strong>{ui("Показывать в кабинете клиента", "Show in client account")}</strong><small>{ui("Видимость визы после сохранения.", "Visa visibility after saving.")}</small></span></label>
        <label className="crm-toggle"><input type="checkbox" checked={notifyClient} disabled={!!submitting || !showToClient || selectedCase.notifications_enabled === false} onChange={event => setNotifyClient(event.target.checked)} /><span><strong>{ui("Уведомить об изменениях", "Notify about changes")}</strong><small>{selectedCase.notifications_enabled === false ? ui("Клиент отключил уведомления.", "The client opted out.") : !showToClient ? ui("Доступно для опубликованной визы.", "Available for a published visa.") : ui("Одно сообщение после подтверждения.", "One message after confirmation.")}</small></span></label>
      </div>
      {editorError && <p className="admin-alert" role="alert">{editorError}</p>}
      <div className="crm-save-actions">
        <button disabled={!!submitting} type="button" onClick={() => editCase(selectedCase)}>{ui("Сбросить", "Reset")}</button>
        <button disabled={!!submitting} type="button" onClick={() => setSelectedCase(null)}>{ui("Отмена", "Cancel")}</button>
        <button disabled={!!submitting} className="button primary" type="button" onClick={() => { if (notifyClient && canNotifyVisaChange(showToClient, selectedCase.notifications_enabled)) setSaveNotifyConfirm(true); else void saveCase(null, false); }}>{submitting === "document-upload" ? ui("Загрузка документа…", "Document upload in progress…") : submitting ? ui("Сохраняем всё…", "Saving everything…") : notifyClient ? ui("Сохранить и уведомить", "Save and notify") : ui("Сохранить", "Save")}</button>
      </div>
    </div></Dialog>}
    {saveNotifyConfirm && <Dialog labelledBy="save-notify-title" onClose={() => setSaveNotifyConfirm(false)}><div><h2 id="save-notify-title">{dialogueLocale === "ru" ? "Сохранить все изменения и уведомить?" : "Save all changes and notify?"}</h2><p>{dialogueLocale === "ru" ? "Кейс и все процессы сохранятся одной транзакцией, затем будет создано ровно одно уведомление CASE_UPDATED." : "The case and all processes will be saved in one transaction, then exactly one CASE_UPDATED notification will be created."}</p><div><button type="button" disabled={!!submitting} onClick={() => setSaveNotifyConfirm(false)}>{dialogueLocale === "ru" ? "Отмена" : "Cancel"}</button><button className="button primary" type="button" disabled={!!submitting} onClick={() => { setSaveNotifyConfirm(false); void saveCase(null, true); }}>{dialogueLocale === "ru" ? "Подтвердить сохранение" : "Confirm save"}</button></div></div></Dialog>}
    {assignmentConfirm && selectedCase && <Dialog labelledBy="assignment-confirm-title" onClose={() => { if (!submitting) { setAssignmentConfirm(false); returnAssignmentFocus(); } }}><section><h2 id="assignment-confirm-title">{assignmentMode === "add" ? ui("Добавить ответственного сотрудника?", "Add assigned staff?") : ui("Отозвать назначение?", "Revoke assignment?")}</h2><p>{assignmentMode === "add" ? ui("Сотрудник сразу получит доступ к этой визе, диалогу и разрешённым защищённым документам. Действие будет записано в аудит.", "The staff member immediately receives access to this visa, its dialogue, and allowed protected documents. The action is audited.") : ui("Сотрудник сразу потеряет доступ к этой визе. Другие назначения и история сохранятся.", "The staff member immediately loses access to this visa. Other assignments and history remain.")}</p><p><strong>{assignmentMode === "add" ? managerOptions.find((manager) => manager.id === assignedManagerId)?.name : assignmentTarget?.name}</strong></p>{assignmentMode === "revoke" && <label>{ui("Причина отзыва назначения", "Assignment revocation reason")}<textarea autoFocus value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} /></label>}<div><button type="button" disabled={!!submitting} onClick={() => { setAssignmentConfirm(false); returnAssignmentFocus(); }}>{locale === "ru" ? "Отмена" : "Cancel"}</button><button className={assignmentMode === "revoke" ? "danger" : "button primary"} type="button" disabled={!!submitting || assignmentReason.trim().length < 3} onClick={() => void changeCaseAssignment()}>{submitting === "assignment" ? (assignmentMode === "add" ? ui("Назначаем…", "Assigning…") : ui("Отзываем…", "Revoking…")) : assignmentMode === "add" ? ui("Да, добавить", "Yes, add") : ui("Да, отозвать", "Yes, revoke")}</button></div></section></Dialog>}
    {notifySummaryConfirm && selectedCase && <Dialog labelledBy="manual-notify-title" onClose={() => { if (!submitting) { setNotifySummaryConfirm(false); returnNotificationFocus(); } }}><section><h2 id="manual-notify-title">{ui("Уведомить клиента о текущем статусе?", "Notify the client about current status?")}</h2><p>{ui("Изменения сохранять не требуется. Будет создана одна ручная сводка STATUS_SUMMARY_MANUAL с текущими статусами и подтверждёнными датами. Постановка в очередь не равна доставке.", "No save is required. One STATUS_SUMMARY_MANUAL message with current statuses and confirmed dates will be created. Queueing is not the same as delivery.")}</p><label>{ui("Причина отправки", "Reason for sending")}<textarea autoFocus value={notifySummaryReason} onChange={(event) => setNotifySummaryReason(event.target.value)} /></label><div><button type="button" disabled={!!submitting} onClick={() => { setNotifySummaryConfirm(false); returnNotificationFocus(); }}>{ui("Отмена", "Cancel")}</button><button type="button" className="button primary" disabled={!!submitting || notifySummaryReason.trim().length < 3} onClick={() => void sendStatusSummary()}>{submitting === "manual-notify" ? ui("Ставим в очередь…", "Queueing…") : ui("Уведомить", "Notify")}</button></div></section></Dialog>}
    {retryNotification && selectedCase && <Dialog labelledBy="notification-retry-title" onClose={() => { if (!submitting) { setRetryNotification(null); returnNotificationFocus(); } }}><section><h2 id="notification-retry-title">{ui("Повторить доставку?", "Retry delivery?")}</h2><p>{ui("Повтор разрешён backend только для подтверждённой ошибки до отправки. UNKNOWN и уже доставленные сообщения повторить нельзя.", "Backend permits retry only for a confirmed pre-send failure. UNKNOWN and delivered messages cannot be retried.")}</p><label>{ui("Причина повтора", "Retry reason")}<textarea autoFocus value={retryNotificationReason} onChange={(event) => setRetryNotificationReason(event.target.value)} /></label><div><button type="button" disabled={!!submitting} onClick={() => { setRetryNotification(null); returnNotificationFocus(); }}>{ui("Отмена", "Cancel")}</button><button type="button" className="button primary" disabled={!!submitting || retryNotificationReason.trim().length < 3} onClick={() => void retryStatusDelivery()}>{submitting.startsWith("notification-retry") ? ui("Повторяем…", "Retrying…") : ui("Повторить один раз", "Retry once")}</button></div></section></Dialog>}
    {publicationConfirm && selectedCase && <Dialog labelledBy="visa-publication-title" onClose={() => { if (!submitting) setPublicationConfirm(null); }}><section><h2 id="visa-publication-title">{ui("Переместить визу в архив?", "Move visa to archive?")}</h2><p>{ui("Виза будет скрыта от клиента и появится в разделе «Архив виз». Данные, история и аудит сохранятся; это действие не удаляет записи из базы.", "The visa will be hidden from the client and appear in Visa archive. Data, history, and audit remain; this action does not delete database records.")}</p><div><button disabled={!!submitting} onClick={() => setPublicationConfirm(null)}>{ui("Нет", "No")}</button><button disabled={!!submitting} className="button primary" onClick={() => void publication("archive")}>{submitting ? ui("Перемещаем…", "Moving…") : ui("Да, в архив", "Yes, archive")}</button></div></section></Dialog>}
  </section>;

  const filterOptions = [
    ["", locale === "ru" ? "Все" : "All"], ["active", locale === "ru" ? "Активная виза" : "Active visa"], ["processing", locale === "ru" ? "Оформление" : "Processing"], ["action", locale === "ru" ? "Нужно действие" : "Action needed"], ["none", locale === "ru" ? "Без виз" : "No visas"], ["notifications_off", locale === "ru" ? "Без уведомлений" : "Notifications off"],
  ] as const;
  const applyFilter = (filter: string) => { setVisaFilter(filter); void loadClients(search, filter, sort, true); };
  return <section className="admin-panel"><div className="admin-panel-head"><div><h2>{locale === "ru" ? "Клиенты" : "Clients"}</h2><p>{locale === "ru" ? "Единый профиль Telegram и личного кабинета." : "One profile for Telegram and the browser account."}</p></div><span>{clientTotal} {locale === "ru" ? "записей" : "items"}</span></div>{error && <div className="admin-alert" role="alert">{error}</div>}<form className="crm-search" onSubmit={(event) => { event.preventDefault(); void loadClients(search, visaFilter, sort, true); }}><label htmlFor="crm-search">{locale === "ru" ? "Поиск по SAFRWAY ID, Telegram, имени, телефону или email" : "Search by SAFRWAY ID, Telegram, name, phone, or email"}</label><div><input id="crm-search" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label={locale === "ru" ? "Фильтр виз" : "Visa filter"} value={visaFilter} onChange={(event) => applyFilter(event.target.value)}>{filterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label={locale === "ru" ? "Наличие услуг" : "Service presence"} value={servicePresence} onChange={(event) => { const next = event.target.value as ServicePresence; updateServicePresence(next); void loadClients(search, visaFilter, sort, true, next); }}><option value="all">{ui("Все клиенты", "All clients")}</option><option value="with">{ui("С услугами", "With services")}</option><option value="without">{ui("Без услуг", "No services")}</option></select><select aria-label={locale === "ru" ? "Сортировка" : "Sort"} value={sort} onChange={(event) => { const next = event.target.value as ClientSort; setSort(next); void loadClients(search, visaFilter, next, true); }}><option value="joined_desc">{locale === "ru" ? "Сначала новые" : "Newest first"}</option><option value="joined_asc">{locale === "ru" ? "Сначала ранние" : "Oldest first"}</option><option value="name_asc">{locale === "ru" ? "Имя А–Я" : "Name A–Z"}</option><option value="name_desc">{locale === "ru" ? "Имя Я–А" : "Name Z–A"}</option><option value="activity_desc">{locale === "ru" ? "По активности" : "Recent activity"}</option><option value="status_asc">{locale === "ru" ? "По статусу" : "By status"}</option></select><button className="button secondary">{locale === "ru" ? "Найти" : "Search"}</button></div></form><div className="crm-filter-chips" aria-label={locale === "ru" ? "Быстрые фильтры" : "Quick filters"}>{filterOptions.map(([value, label]) => <button type="button" key={value} aria-pressed={visaFilter === value} onClick={() => applyFilter(value)}>{label}</button>)}</div>{loading ? <div className="admin-empty">{locale === "ru" ? "Загружаем клиентов…" : "Loading clients…"}</div> : !clients.length ? <div className="admin-empty">{locale === "ru" ? "Клиенты не найдены." : "No clients found."}</div> : <div className="crm-client-grid">{clients.map((client) => { const name = [client.first_name, client.last_name].filter(Boolean).join(" ") || client.username || (locale === "ru" ? `Клиент ${client.id}` : `Client ${client.id}`); const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); return <button className={`crm-client-card-button${client.has_registered_services ? " has-services" : ""}`} key={client.id} onClick={() => void openClient(client.id)}><span className="crm-client-avatar" aria-hidden="true">{initials}</span><span className="eyebrow">SAFRWAY ID {client.id}</span><strong>{name}</strong>{client.has_registered_services && <span className="admin-service-marker">{locale === "ru" ? "Есть услуги" : "Has services"}</span>}{client.username && <span>@{client.username.replace(/^@/, "")}</span>}<dl><div><dt>{locale === "ru" ? "Визы" : "Visas"}</dt><dd>{client.active_visa_count}</dd></div><div><dt>{locale === "ru" ? "Статус" : "Status"}</dt><dd>{client.requires_attention ? (locale === "ru" ? "Нужно действие" : "Action needed") : client.bot_status}</dd></div><div><dt>{locale === "ru" ? "Активность" : "Activity"}</dt><dd>{client.last_activity_at ? new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium" }).format(new Date(client.last_activity_at)) : "—"}</dd></div></dl><small>{locale === "ru" ? "Открыть карточку →" : "Open profile →"}</small></button>; })}</div>}</section>;
}
