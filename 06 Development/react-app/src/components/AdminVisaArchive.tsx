import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import { AdminDialog } from "./AdminDialog";
import { VisaStatusHelp } from "./VisaStatusHelp";

type Locale = "ru" | "en";
type ArchiveSort = "archived_desc" | "archived_asc";
type ArchiveClient = { id: number; name: string; username?: string; telegram_id_mask: string };
type ArchiveCase = {
  id: number;
  user_id: number;
  country_code: string;
  custom_visa_name?: string;
  visa_type: { code: string; name: string };
  service_status: string;
  lifecycle_status: string;
  publication_status: "ARCHIVED";
  notifications_enabled?: boolean;
  next_action_text?: string;
  archived_at?: string;
  updated_at?: string;
  version: number;
  client?: ArchiveClient | null;
};
type ArchivePage = { items: ArchiveCase[]; total: number; page: number };
type DeletePreview = {
  case_id: number;
  visa_type_code: string;
  dependency_counts: Record<string, number>;
  unexpected_dependencies: string[];
  protected_files_present: boolean;
  executable: boolean;
};

const serviceStatuses = ["PURCHASED", "DOCUMENTS_REQUIRED", "DOCUMENTS_RECEIVED", "SUBMITTED", "WAITING_PAYMENT", "PAID", "PROCESSING", "ACTION_REQUIRED", "COMPLETED", "CANCELLED"];
const lifecycleStatuses = ["NOT_ISSUED", "ISSUED_NOT_ACTIVATED", "ACTIVE", "EXPIRING", "EXTENSION_PROCESSING", "EXTENDED", "EXPIRED", "CANCELLED", "REFUSED"];

function archiveCaseId() {
  const id = Number(window.location.pathname.match(/^\/admin\/visa-archive\/(\d+)\/?$/)?.[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function initialFilters() {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get("sort");
  return {
    search: params.get("search") ?? "",
    serviceStatus: params.get("service_status") ?? "",
    lifecycleStatus: params.get("lifecycle_status") ?? "",
    sort: (sort === "archived_asc" ? sort : "archived_desc") as ArchiveSort,
  };
}

function archiveUrl(search: string, serviceStatus: string, lifecycleStatus: string, sort: ArchiveSort, id?: number | null) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (serviceStatus) params.set("service_status", serviceStatus);
  if (lifecycleStatus) params.set("lifecycle_status", lifecycleStatus);
  if (sort !== "archived_desc") params.set("sort", sort);
  const path = id ? `/admin/visa-archive/${id}/` : "/admin/visa-archive/";
  return `${path}${params.size ? `?${params}` : ""}`;
}

function displayDate(value: string | undefined, locale: Locale) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export function AdminVisaArchive({ csrfToken, locale }: { csrfToken: string; locale: Locale }) {
  const initial = initialFilters();
  const [items, setItems] = useState<ArchiveCase[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(initial.search);
  const [serviceStatus, setServiceStatus] = useState(initial.serviceStatus);
  const [lifecycleStatus, setLifecycleStatus] = useState(initial.lifecycleStatus);
  const [sort, setSort] = useState<ArchiveSort>(initial.sort);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selected, setSelected] = useState<ArchiveCase | null>(null);
  const [pendingDetailId, setPendingDetailId] = useState<number | null>(archiveCaseId);
  const [restoreCase, setRestoreCase] = useState<ArchiveCase | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ArchiveCase | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [submitting, setSubmitting] = useState<"" | "restore" | "preview" | "delete">("");
  const restoreButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const restoreWasOpenRef = useRef(false);

  const copy = useMemo(() => locale === "ru" ? {
    title: "Архив виз", subtitle: "Отдельное безопасное место для закрытых виз. Клиент их не видит.", search: "Поиск по клиенту, визе, SAFRWAY ID или номеру кейса", allService: "Все статусы услуги", allLifecycle: "Все статусы визы", newest: "Сначала недавно архивированные", oldest: "Сначала давно архивированные", find: "Найти", loading: "Загружаем архив виз…", empty: "В архиве виз нет.", retry: "Повторить", open: "Открыть архивную визу", client: "Клиент", archived: "В архиве с", service: "Статус услуги", lifecycle: "Статус визы", next: "Следующее действие", back: "Архив виз", restore: "Вернуть из архива", restoreTitle: "Вернуть визу в работу?", restoreBody: "Виза перейдёт в скрытое рабочее состояние и останется невидимой клиенту. Публикация и уведомление не выполняются.", reason: "Причина", cancel: "Отмена", restoring: "Возвращаем…", confirmRestore: "Да, вернуть в работу", restored: "Виза возвращена в скрытое рабочее состояние без уведомления клиента.", delete: "Удалить навсегда…", deleteTitle: "Удалить архивную визу навсегда?", deleteBody: "Будут удалены только эта виза и её собственные операционные записи. Клиент, заказы, рефералы, Points, диалоги и другие визы останутся. Минимальная запись аудита сохранится.", deleteBlocked: "Удаление заблокировано зависимостями или защищёнными файлами.", deleting: "Удаляем…", confirmDelete: "Удалить навсегда", deleted: "Архивная виза удалена. Минимальная запись аудита сохранена.", count: "записей", detailError: "Архивная виза не найдена или доступ запрещён.", filters: "Фильтры архива",
  } : {
    title: "Visa archive", subtitle: "A separate safe place for closed visas. Clients cannot see them.", search: "Search by client, visa, SAFRWAY ID, or case number", allService: "All service statuses", allLifecycle: "All visa statuses", newest: "Recently archived first", oldest: "Oldest archived first", find: "Search", loading: "Loading visa archive…", empty: "Visa archive is empty.", retry: "Retry", open: "Open archived visa", client: "Client", archived: "Archived", service: "Service status", lifecycle: "Visa status", next: "Next action", back: "Visa archive", restore: "Restore from archive", restoreTitle: "Return this visa to work?", restoreBody: "The visa moves to a hidden work state and remains invisible to the client. It is not published and no notification is sent.", reason: "Reason", cancel: "Cancel", restoring: "Restoring…", confirmRestore: "Yes, restore to work", restored: "The visa was restored to a hidden work state without notifying the client.", delete: "Delete permanently…", deleteTitle: "Permanently delete this archived visa?", deleteBody: "Only this visa and its case-owned operational rows are deleted. The client, orders, referrals, Points, conversations, and other visas remain. A minimal audit record is retained.", deleteBlocked: "Delete is blocked by dependencies or protected files.", deleting: "Deleting…", confirmDelete: "Delete permanently", deleted: "The archived visa was deleted. A minimal audit record remains.", count: "items", detailError: "Archived visa not found or access denied.", filters: "Archive filters",
  }, [locale]);

  async function load(next = { search, serviceStatus, lifecycleStatus, sort }, syncUrl = false) {
    setState("loading"); setError("");
    const params = new URLSearchParams({ page: "1", page_size: "100", sort: next.sort });
    if (next.search.trim()) params.set("search", next.search.trim());
    if (next.serviceStatus) params.set("service_status", next.serviceStatus);
    if (next.lifecycleStatus) params.set("lifecycle_status", next.lifecycleStatus);
    try {
      const page = await appApiClient().request<ArchivePage>(`/api/web/admin/visa-cases/archive?${params}`);
      setItems(page.items); setTotal(page.total); setState("ready");
      if (syncUrl) window.history.replaceState({ safrVisaArchiveList: true }, "", archiveUrl(next.search, next.serviceStatus, next.lifecycleStatus, next.sort));
      const id = pendingDetailId ?? archiveCaseId();
      if (id) {
        const listed = page.items.find((item) => item.id === id);
        if (listed) setSelected(listed);
        else {
          try {
            const detail = await appApiClient().request<ArchiveCase>(`/api/web/admin/visa-cases/${id}`);
            if (detail.publication_status !== "ARCHIVED") throw new Error("not archived");
            setSelected(detail);
          } catch {
            setSelected(null); setError(copy.detailError); setState("error");
          }
        }
        setPendingDetailId(null);
      }
    } catch (caught) {
      setError(locale === "ru" ? apiErrorMessage(caught) : "Could not load the visa archive."); setState("error");
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (restoreCase) { restoreWasOpenRef.current = true; return; }
    if (!restoreWasOpenRef.current) return;
    restoreWasOpenRef.current = false;
    window.requestAnimationFrame(() => restoreButtonRef.current?.focus());
  }, [restoreCase]);
  useEffect(() => {
    if (feedback) window.requestAnimationFrame(() => feedbackRef.current?.focus());
  }, [feedback]);
  useEffect(() => {
    const onPopState = () => {
      const id = archiveCaseId();
      setPendingDetailId(id);
      if (!id) setSelected(null);
      else {
        const match = items.find((item) => item.id === id);
        if (match) setSelected(match);
        else void load({ search, serviceStatus, lifecycleStatus, sort });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [items, search, serviceStatus, lifecycleStatus, sort]);

  function openCase(item: ArchiveCase) {
    window.history.pushState({ safrVisaArchiveDetail: true }, "", archiveUrl(search, serviceStatus, lifecycleStatus, sort, item.id));
    setSelected(item); setFeedback(""); setError("");
  }

  function backToArchive() {
    window.history.pushState({ safrVisaArchiveList: true }, "", archiveUrl(search, serviceStatus, lifecycleStatus, sort));
    setSelected(null); setFeedback(""); setError("");
  }

  async function restoreArchivedCase() {
    if (!restoreCase || restoreReason.trim().length < 3 || submitting) return;
    setSubmitting("restore"); setError("");
    try {
      await appApiClient().request(`/api/web/admin/visa-cases/${restoreCase.id}/publication/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ notify_client: false, reason: restoreReason.trim(), idempotency_key: crypto.randomUUID() }),
      });
      setItems((current) => current.filter((item) => item.id !== restoreCase.id)); setTotal((current) => Math.max(0, current - 1));
      setRestoreCase(null); setRestoreReason(""); setSelected(null); setFeedback(copy.restored);
      window.history.replaceState({ safrVisaArchiveList: true }, "", archiveUrl(search, serviceStatus, lifecycleStatus, sort));
    } catch (caught) { setError(locale === "ru" ? apiErrorMessage(caught) : "Could not restore the archived visa. Nothing changed."); }
    finally { setSubmitting(""); }
  }

  async function prepareDelete(item: ArchiveCase) {
    if (submitting) return;
    setSubmitting("preview"); setError("");
    try {
      const preview = await appApiClient().request<DeletePreview>(`/api/web/admin/visa-cases/${item.id}/delete-preview`);
      if (!preview.executable || preview.protected_files_present || preview.unexpected_dependencies.length) {
        setError(copy.deleteBlocked); return;
      }
      setDeleteTarget(item); setDeletePreview(preview); setDeleteReason("");
    } catch (caught) { setError(caught instanceof ApiError && caught.status === 404 ? copy.deleteBlocked : apiErrorMessage(caught)); }
    finally { setSubmitting(""); }
  }

  function closeDeleteDialog() {
    setDeleteTarget(null); setDeletePreview(null); setDeleteReason("");
    window.requestAnimationFrame(() => deleteButtonRef.current?.focus());
  }

  async function permanentlyDelete() {
    if (!deleteTarget || !deletePreview || deleteReason.trim().length < 3 || submitting) return;
    setSubmitting("delete"); setError("");
    try {
      await appApiClient().request(`/api/web/admin/visa-cases/${deleteTarget.id}/permanent-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ confirm_case_id: deleteTarget.id, expected_version: deleteTarget.version, reason: deleteReason.trim(), idempotency_key: crypto.randomUUID() }),
      });
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id)); setTotal((current) => Math.max(0, current - 1));
      setDeleteTarget(null); setDeletePreview(null); setDeleteReason(""); setSelected(null); setFeedback(copy.deleted);
      window.history.replaceState({ safrVisaArchiveList: true }, "", archiveUrl(search, serviceStatus, lifecycleStatus, sort));
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 409 ? (locale === "ru" ? "Версия изменилась; ничего не удалено. Обновите архив и повторите." : "The version changed; nothing was deleted. Reload the archive and retry.") : apiErrorMessage(caught));
    } finally { setSubmitting(""); }
  }

  function dependencyLabel(key: string) {
    const labels: Record<string, [string, string]> = {
      visa_processes: ["Процессы визы", "Visa processes"],
      visa_events: ["События визы", "Visa events"],
      visa_notification_deliveries: ["Уведомления по визе", "Visa notifications"],
      visa_documents: ["Документы визы", "Visa documents"],
      visa_case_dates: ["Подтверждённые даты", "Confirmed dates"],
    };
    const label = labels[key];
    return label ? label[locale === "ru" ? 0 : 1] : (locale === "ru" ? "Связанная запись" : "Related record");
  }

  if (selected) return <section className="admin-panel admin-archive-detail">
    <button className="admin-back" type="button" onClick={backToArchive}>← {copy.back}</button>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    <header className="admin-panel-head"><div><span className="eyebrow">{selected.visa_type.code} · #{selected.id}</span><h2>{selected.custom_visa_name || selected.visa_type.name}</h2><p>{copy.client}: {selected.client?.name ?? `SAFRWAY ID ${selected.user_id}`}</p></div><span>{selected.publication_status}</span></header>
    <dl className="admin-archive-facts"><div><dt>{copy.service}</dt><dd>{selected.service_status}</dd></div><div><dt>{copy.lifecycle}</dt><dd>{selected.lifecycle_status} <VisaStatusHelp kind="visa" code={selected.lifecycle_status} locale={locale} showCode={false} /></dd></div><div><dt>{copy.archived}</dt><dd>{displayDate(selected.archived_at ?? selected.updated_at, locale)}</dd></div><div><dt>{copy.next}</dt><dd>{selected.next_action_text || "—"}</dd></div></dl>
    <div className="admin-archive-actions"><button ref={restoreButtonRef} type="button" className="button secondary" disabled={!!submitting} onClick={() => { setRestoreReason(""); setRestoreCase(selected); }}>{copy.restore}</button><button ref={deleteButtonRef} type="button" className="danger" disabled={!!submitting} onClick={() => void prepareDelete(selected)}>{submitting === "preview" ? copy.loading : copy.delete}</button></div>
    {restoreCase && <AdminDialog labelledBy="archive-restore-title" closeDisabled={!!submitting} onClose={() => { setRestoreCase(null); setRestoreReason(""); }}><span className="eyebrow">{copy.restore}</span><h2 id="archive-restore-title">{copy.restoreTitle}</h2><p>{copy.restoreBody}</p><label>{copy.reason}<textarea autoFocus minLength={3} value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} /></label><div className="admin-dialog-actions"><button type="button" disabled={!!submitting} onClick={() => { setRestoreCase(null); setRestoreReason(""); }}>{copy.cancel}</button><button type="button" className="button primary" disabled={restoreReason.trim().length < 3 || !!submitting} onClick={() => void restoreArchivedCase()}>{submitting === "restore" ? copy.restoring : copy.confirmRestore}</button></div></AdminDialog>}
    {deleteTarget && deletePreview && <AdminDialog labelledBy="archive-delete-title" closeDisabled={!!submitting} onClose={closeDeleteDialog} className="crm-delete-confirm"><span className="eyebrow">{locale === "ru" ? "Необратимое действие" : "Irreversible action"}</span><h2 id="archive-delete-title">{copy.deleteTitle}</h2><p><strong>{deleteTarget.custom_visa_name || deleteTarget.visa_type.name}</strong> · #{deleteTarget.id}</p><p>{copy.deleteBody}</p><dl>{Object.entries(deletePreview.dependency_counts).map(([name, count]) => <div key={name}><dt>{dependencyLabel(name)}</dt><dd>{count}</dd></div>)}</dl><label>{copy.reason}<textarea autoFocus required minLength={3} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></label><div className="admin-dialog-actions"><button type="button" disabled={!!submitting} onClick={closeDeleteDialog}>{copy.cancel}</button><button type="button" className="danger" disabled={deleteReason.trim().length < 3 || !!submitting} onClick={() => void permanentlyDelete()}>{submitting === "delete" ? copy.deleting : copy.confirmDelete}</button></div></AdminDialog>}
  </section>;

  return <section className="admin-panel admin-archive">
    <div className="admin-panel-head"><div><h2>{copy.title}</h2><p>{copy.subtitle}</p></div><span>{total} {copy.count}</span></div>
    {feedback && <div ref={feedbackRef} className="admin-outcome" role="status" aria-live="polite" tabIndex={-1}>{feedback}</div>}
    {error && <div className="admin-alert" role="alert">{error}</div>}
    <form className="admin-archive-filters" aria-label={copy.filters} onSubmit={(event) => { event.preventDefault(); void load({ search, serviceStatus, lifecycleStatus, sort }, true); }}>
      <label>{copy.search}<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>{copy.service}<select value={serviceStatus} onChange={(event) => setServiceStatus(event.target.value)}><option value="">{copy.allService}</option>{serviceStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>{copy.lifecycle}<select value={lifecycleStatus} onChange={(event) => setLifecycleStatus(event.target.value)}><option value="">{copy.allLifecycle}</option>{lifecycleStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>{locale === "ru" ? "Сортировка" : "Sort"}<select value={sort} onChange={(event) => setSort(event.target.value as ArchiveSort)}><option value="archived_desc">{copy.newest}</option><option value="archived_asc">{copy.oldest}</option></select></label>
      <button className="button secondary" type="submit">{copy.find}</button>
    </form>
    {state === "loading" ? <div className="admin-empty" role="status">{copy.loading}</div> : state === "error" ? <div className="admin-empty"><button className="button secondary" type="button" onClick={() => void load()}>{copy.retry}</button></div> : items.length === 0 ? <div className="admin-empty">{copy.empty}</div> : <div className="admin-archive-grid">{items.map((item) => <article className="admin-archive-card" key={item.id}><button type="button" className="admin-card-main" onClick={() => openCase(item)}><span className="eyebrow">{item.visa_type.code} · #{item.id}</span><strong>{item.custom_visa_name || item.visa_type.name}</strong><span>{item.client?.name ?? `SAFRWAY ID ${item.user_id}`}</span><span>{item.service_status}</span><span>{item.lifecycle_status}</span><small>{copy.archived}: {displayDate(item.archived_at ?? item.updated_at, locale)}</small><span className="admin-card-link">{copy.open} →</span></button></article>)}</div>}
  </section>;
}
