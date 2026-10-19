import { useEffect, useRef, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import "./admin-messaging.css";

type Bot = "safrway" | "yoga";
type Language = "ru" | "en";
type Copy = { welcome_text: string; followup_text: string };
type Locales = Record<Language, Copy>;
type MessagePreview = { valid: boolean; parts: string[]; followup_text: string; error?: string };
type Policy = { bot_key: Bot; revision: number; enabled: boolean; published_version: number | null;
  draft: { locales?: Locales }; prepared: { locales: Locales }; preview: Record<Language, MessagePreview> | null };
type Campaign = { id: number; bot_key: Bot; kind: "announcement" | "welcome_backfill"; title: string;
  state: string; revision: number; counts: Record<string, number> };
type Preview = { campaign_id: number; revision: number; snapshot_sha256: string; recipient_count: number;
  bot_key: Bot; kind: Campaign["kind"]; content: Record<string, unknown>; content_version: number | null; followup_enabled: boolean;
  message_previews?: Record<Language, MessagePreview> | null; unverified_main_registration_count?: number };
type Recipient = { user_id: number; name: string; username?: string; locale: string; state: string; deliveries: Record<string, number> };
type Person = { id: number; first_name?: string; last_name?: string; username?: string };
type Attempt = { campaignId: number; body: string };
const BASE = "/api/web/admin/messaging";
const ATTEMPT_KEY = "safr-admin-messaging-confirmation-v1";
const emptyCopy = (): Locales => ({ ru: { welcome_text: "", followup_text: "" }, en: { welcome_text: "", followup_text: "" } });
function stateLabel(value: string, ru: boolean) {
  const labels: Record<string, [string, string]> = { DRAFT: ["Черновик", "Draft"], PREVIEW: ["На проверке", "In review"],
    QUEUED: ["В очереди", "Queued"], ENROLLED: ["Приветствие запланировано", "Welcome scheduled"], PENDING: ["Ожидает", "Pending"],
    CLAIMED: ["В обработке", "In progress"], DELIVERED: ["Доставка подтверждена", "Delivery confirmed"], FAILED: ["Не доставлено", "Failed"],
    UNKNOWN: ["Исход неизвестен — проверить вручную", "Unknown outcome — manual review"], SUPPRESSED: ["Отправка запрещена", "Suppressed"],
    SKIPPED: ["Уже учтено, без повтора", "Already enrolled, no repeat"], CANCELLED: ["Отменено", "Cancelled"], COMPLETE: ["Обработано", "Processed"] };
  return labels[value]?.[ru ? 0 : 1] ?? value;
}

function savedAttempt(): Attempt | null {
  try {
    const raw = sessionStorage.getItem(ATTEMPT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Attempt;
    const body = JSON.parse(value.body) as Record<string, unknown>;
    if (!Number.isSafeInteger(value.campaignId) || value.campaignId <= 0 || typeof body.idempotency_key !== "string"
        || !Number.isSafeInteger(body.expected_revision) || !/^[0-9a-f]{64}$/.test(String(body.snapshot_sha256))) return null;
    return value;
  } catch { return null; }
}

export function AdminMessaging({ csrfToken, locale }: { csrfToken: string; locale: Language }) {
  const ru = locale === "ru";
  const [bot, setBot] = useState<Bot>("safrway");
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [copy, setCopy] = useState<Locales>(emptyCopy);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [kind, setKind] = useState<Campaign["kind"]>("announcement");
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState("all");
  const [categories, setCategories] = useState(["visa"]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person[]>([]);
  const [content, setContent] = useState({ ru: "", en: "" });
  const [followup, setFollowup] = useState(false);
  const [legacyOnce, setLegacyOnce] = useState(false);
  const [legacyApproved, setLegacyApproved] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [resultRecipients, setResultRecipients] = useState<{ campaignId: number; items: Recipient[] } | null>(null);
  const [approved, setApproved] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(savedAttempt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const live = useRef(true), pending = useRef(false), controllers = useRef(new Set<AbortController>());
  const attemptRef = useRef(attempt); attemptRef.current = attempt;
  useEffect(() => { live.current = true; return () => { live.current = false; controllers.current.forEach(c => c.abort()); }; }, []);

  async function request<T,>(path: string, body?: unknown, method = "POST"): Promise<T> {
    const controller = new AbortController(); controllers.current.add(controller);
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try { return await appApiClient().request<T>(path, { signal: controller.signal,
      ...(body === undefined ? {} : { method, headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(body) }) }); }
    finally { window.clearTimeout(timer); controllers.current.delete(controller); }
  }
  async function refresh() {
    const result = await request<{ items: Campaign[] }>(`${BASE}/campaigns`);
    if (live.current) setCampaigns(result.items);
  }
  async function run(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try { await operation(); } catch (caught) { if (live.current) setError(apiErrorMessage(caught)); }
    finally { pending.current = false; if (live.current) setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    setPolicy(null); setPreview(null); setRecipients([]); setApproved(false); setLegacyOnce(false); setLegacyApproved(false);
    void request<Policy>(`${BASE}/policy/${bot}`).then(next => {
      if (active && live.current) { setPolicy(next); setCopy(next.draft.locales ?? next.prepared.locales); }
    }).catch(caught => { if (active && live.current) setError(apiErrorMessage(caught)); });
    void refresh().catch(caught => { if (active && live.current) setError(apiErrorMessage(caught)); });
    void request<{ service_categories: string[] }>(`${BASE}/audience-options`).then(result => {
      if (active && live.current) setCategoryOptions(result.service_categories);
    }).catch(caught => { if (active && live.current) setError(apiErrorMessage(caught)); });
    return () => { active = false; };
  }, [bot]); // A policy refresh never queues or sends anything.

  const dirty = !!policy && JSON.stringify(copy) !== JSON.stringify(policy.draft.locales);
  const locked = busy || attempt !== null;
  async function policyAction(action: "draft" | "publish" | "toggle") {
    if (!policy || attemptRef.current) return;
    await run(async () => {
      const body = { expected_revision: policy.revision, ...(action === "draft" ? { locales: copy } : action === "toggle" ? { enabled: !policy.enabled } : {}) };
      const result = await request<Policy>(`${BASE}/policy/${bot}/${action}`, body, action === "draft" ? "PUT" : "POST");
      if (live.current) { setPolicy(result); setCopy(result.draft.locales ?? result.prepared.locales); setNotice(ru ? "Настройка сохранена. Разовая рассылка не запускалась." : "Policy saved. No catch-up campaign was started."); }
    });
  }
  async function prepare() {
    if (attemptRef.current) return;
    await run(async () => {
      setPreview(null); setRecipients([]); setApproved(false); setLegacyApproved(false);
      const filters = audience === "category" ? { service_categories: categories } : audience === "no_services" ? { no_services: true } : audience === "never_dialogued" ? { never_dialogued: true } : {};
      const row = await request<Campaign>(`${BASE}/campaigns`, { bot_key: bot, kind, title,
        ...(audience === "individuals" ? { user_ids: selected.map(p => p.id) } : { filters }),
        ...(kind === "announcement" ? { content } : { content_version: policy?.published_version, followup }),
        legacy_main_once: legacyOnce && bot === "safrway" && kind === "welcome_backfill" });
      const next = await request<Preview>(`${BASE}/campaigns/${row.id}/preview`, { expected_revision: row.revision });
      const list = await request<{ items: Recipient[] }>(`${BASE}/campaigns/${row.id}/recipients`);
      if (live.current) { setPreview(next); setRecipients(list.items); }
      await refresh();
    });
  }
  async function confirm() {
    if (!attemptRef.current && (!preview || !approved || (preview.unverified_main_registration_count ?? 0) > 0 && !legacyApproved)) return;
    await run(async () => {
      const exact = attemptRef.current ?? { campaignId: preview!.campaign_id,
        body: JSON.stringify({ expected_revision: preview!.revision, snapshot_sha256: preview!.snapshot_sha256,
          idempotency_key: crypto.randomUUID(), ...((preview!.unverified_main_registration_count ?? 0) > 0 ? { allow_unverified_main_once: true } : {}) }) };
      // Persist only opaque campaign/version/key metadata, no recipients, text or
      // credentials. After timeout/navigation only this exact confirm may retry.
      sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(exact));
      attemptRef.current = exact; if (live.current) setAttempt(exact);
      try {
        await request<Campaign>(`${BASE}/campaigns/${exact.campaignId}/confirm`, JSON.parse(exact.body));
        sessionStorage.removeItem(ATTEMPT_KEY); attemptRef.current = null;
        if (live.current) { setAttempt(null); setPreview(null); setApproved(false); setNotice(ru ? "Кампания поставлена в очередь. Фактическая доставка показана ниже." : "Campaign queued. Actual delivery results appear below."); }
      } catch (caught) {
        // Auth/CSRF/404 after a lost ACK says nothing about the first attempt.
        // Only the credentialed API's locked, explicit non-confirmation proof
        // permits a new preview; all other outcomes retain the exact key.
        const refusal = caught instanceof ApiError ? (caught.details as { detail?: { safe_to_repreview?: boolean; campaign_id?: number; request_key?: string } } | undefined)?.detail : undefined;
        if (caught instanceof ApiError && caught.status === 409 && refusal?.safe_to_repreview === true
            && refusal.campaign_id === exact.campaignId && refusal.request_key === (JSON.parse(exact.body) as { idempotency_key: string }).idempotency_key) {
          sessionStorage.removeItem(ATTEMPT_KEY); attemptRef.current = null;
          if (live.current) { setAttempt(null); setPreview(null); setApproved(false); }
        }
        throw caught;
      }
      const [, current] = await Promise.all([refresh(), request<Policy>(`${BASE}/policy/${bot}`)]);
      if (live.current) { setPolicy(current); setCopy(current.draft.locales ?? current.prepared.locales); }
    });
  }
  function editCampaign(operation: () => void) { operation(); setPreview(null); setRecipients([]); setApproved(false); setLegacyApproved(false); }
  const canPrepare = title.trim() && (audience !== "individuals" || selected.length > 0)
    && (audience !== "category" || categories.length > 0)
    && (kind === "announcement" ? content.ru.trim() && content.en.trim() : policy?.published_version);

  return <section className="admin-panel admin-messaging" aria-busy={busy}>
    <h2>{ru ? "Рупор и приветствия" : "Announcements and welcomes"}</h2>
    <p>{ru ? "Отдельные тексты и контакты каждого бота. Один аккаунт в общей базе не означает, что человек запускал оба бота." : "Each bot has separate copy and contacts. A shared account does not prove the person has started both bots."}</p>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {attempt && <div role="alert"><p>{ru ? `Результат подтверждения кампании #${attempt.campaignId} неизвестен. Не создавайте новую: повторится только тот же запрос, без повторной рассылки.` : `Confirmation result for campaign #${attempt.campaignId} is unknown. Do not create another: retry uses the identical request without duplicating delivery.`}</p><button disabled={busy} onClick={() => void confirm()}>{ru ? "Проверить / повторить тот же запрос" : "Check / retry the same request"}</button></div>}
    <label>{ru ? "Бот" : "Bot"}<select value={bot} disabled={locked} onChange={event => setBot(event.target.value as Bot)}><option value="safrway">SAFRWAY</option><option value="yoga">Yoga Ganster</option></select></label>
    {!policy ? <p>{ru ? "Настройки пока недоступны. Ничего не отправлено." : "Policy is not available yet. Nothing has been sent."}</p> : <>
      <h3>{ru ? "Автоматическое знакомство" : "Automatic welcome"}</h3>
      <p>{ru ? "Через 15 минут после первого подтверждённого контакта именно с этим ботом, затем вопрос через час. Для старых контактов — отдельная разовая кампания ниже." : "15 minutes after first verified contact with this bot, then a follow-up one hour later. Existing contacts need a separate catch-up campaign below."}</p>
      <p className="am-policy-state">{policy.enabled ? (ru ? "Включено" : "Enabled") : (ru ? "Выключено" : "Disabled")} · v{policy.published_version ?? "—"}</p>
      {bot === "safrway" && <button disabled={locked || policy.enabled} onClick={() => void run(async () => {
        const inventory = await request<{ snapshot_sha256: string }>(`${BASE}/legacy-main`);
        const result = await request<{ created_unknown: number }>(`${BASE}/legacy-main`, { expected_snapshot_sha256: inventory.snapshot_sha256 });
        if (live.current) setNotice(ru ? `Подготовлено старых регистраций: ${result.created_unknown}. Личный диалог и доставка не подтверждены. Сообщений не отправлено.` : `Legacy registrations staged: ${result.created_unknown}. Private contact and reachability are unconfirmed. No messages sent.`);
      })}>{ru ? "Подготовить старые Main-регистрации — без отправки" : "Stage legacy Main registrations — no sending"}</button>}
      <fieldset className="am-welcome-editor" disabled={locked} style={{ minWidth: 0 }}>
        {(["ru", "en"] as const).map(language => <details key={language}><summary>{language === "ru" ? "Русский" : "English"}</summary>
          <label>{ru ? "Приветствие" : "Welcome"}<textarea rows={12} value={copy[language].welcome_text} onChange={e => setCopy(old => ({ ...old, [language]: { ...old[language], welcome_text: e.target.value } }))}/></label>
          <label>{ru ? "Вопрос через час" : "Follow-up"}<textarea rows={2} value={copy[language].followup_text} onChange={e => setCopy(old => ({ ...old, [language]: { ...old[language], followup_text: e.target.value } }))}/></label>
          {!dirty && policy.preview?.[language]?.parts.map((part, index) => <p key={index} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{part}</p>)}
        </details>)}
        <div className="crm-save-actions"><button disabled={!dirty} onClick={() => void policyAction("draft")}>{ru ? "Сохранить и проверить оба языка" : "Save and check both languages"}</button>
          <button disabled={dirty || !policy.preview?.ru.valid || !policy.preview?.en.valid} onClick={() => void policyAction("publish")}>{ru ? "Опубликовать версию текста" : "Publish content version"}</button>
          <button disabled={dirty || (!policy.enabled && !policy.published_version)} onClick={() => void policyAction("toggle")}>{policy.enabled ? (ru ? "Выключить приветствия" : "Disable welcomes") : (ru ? "Включить для новых контактов" : "Enable for new contacts")}</button></div>
      </fieldset>
      <h3>{ru ? "Новая рассылка" : "New campaign"}</h3>
      <fieldset className="am-campaign-editor" disabled={locked} style={{ minWidth: 0 }}>
        <label>{ru ? "Название для администратора" : "Internal title"}<input maxLength={200} value={title} onChange={e => editCampaign(() => setTitle(e.target.value))}/></label>
        <label>{ru ? "Тип" : "Kind"}<select value={kind} onChange={e => editCampaign(() => setKind(e.target.value as Campaign["kind"]))}><option value="announcement">{ru ? "Сообщение рупора" : "Announcement"}</option><option value="welcome_backfill">{ru ? "Приветствие тем, кто ещё не получил" : "Welcome users who have not received it"}</option></select></label>
        {bot === "safrway" && kind === "welcome_backfill" && <label><input type="checkbox" checked={legacyOnce} onChange={e => editCampaign(() => setLegacyOnce(e.target.checked))}/>{ru ? "Добавить старые Main-регистрации только в это разовое приветствие; доступность личного диалога не подтверждена" : "Include legacy Main registrations only in this one-off welcome; private reachability is unconfirmed"}</label>}
        <label>{ru ? "Получатели" : "Audience"}<select value={audience} onChange={e => editCampaign(() => setAudience(e.target.value))}>
          <option value="all">{ru ? "Все доступные контакты этого бота" : "All reachable contacts of this bot"}</option><option value="category">{ru ? "Категория услуг" : "Service category"}</option><option value="no_services">{ru ? "Без услуг" : "No services"}</option><option value="never_dialogued">{ru ? "Ещё не обращались" : "No previous conversations"}</option><option value="individuals">{ru ? "Выбранные люди" : "Selected people"}</option>
        </select></label>
        {audience === "category" && <fieldset><legend>{ru ? "Категории — подходит любая выбранная" : "Categories — matches any selected"}</legend>{categoryOptions.map(item => <label key={item}><input type="checkbox" checked={categories.includes(item)} onChange={e => editCampaign(() => setCategories(old => e.target.checked ? [...old, item] : old.filter(value => value !== item)))}/>{item}</label>)}</fieldset>}
        {audience === "individuals" && <div><label>{ru ? "Найти по имени, @username или SAFRWAY ID" : "Find by name, @username or SAFRWAY ID"}<input value={query} onChange={e => setQuery(e.target.value)}/></label>
          <button disabled={!query.trim()} onClick={() => void run(async () => { const result = await request<{ items: Person[] }>(`/api/web/admin/users?q=${encodeURIComponent(query.trim())}&page_size=20`); if (live.current) setPeople(result.items); })}>{ru ? "Найти" : "Search"}</button>
          {people.map(person => <label key={person.id}><input type="checkbox" checked={selected.some(p => p.id === person.id)} onChange={e => editCampaign(() => setSelected(old => e.target.checked ? [...old.filter(p => p.id !== person.id), person] : old.filter(p => p.id !== person.id)))}/>{person.first_name} {person.last_name} {person.username ? `@${person.username}` : ""} · #{person.id}</label>)}
          <p>{ru ? "Выбрано:" : "Selected:"} {selected.map(p => `#${p.id}`).join(", ") || "—"}</p></div>}
        {kind === "announcement" ? (["ru", "en"] as const).map(language => <label key={language}>{language === "ru" ? "Текст RU" : "Text EN"}<textarea rows={6} maxLength={4096} value={content[language]} onChange={e => editCampaign(() => setContent(old => ({ ...old, [language]: e.target.value })))}/></label>) : <label><input type="checkbox" checked={followup} onChange={e => editCampaign(() => setFollowup(e.target.checked))}/>{ru ? "Добавить вопрос через час (необязательно)" : "Include the optional follow-up one hour later"}</label>}
        <button className="am-primary" disabled={!canPrepare} onClick={() => void prepare()}>{ru ? "Подготовить текст и список — без отправки" : "Prepare copy and audience — no sending"}</button>
      </fieldset>
    </>}
    {preview && <section className="am-confirmation" aria-label={ru ? "Подтверждение рассылки" : "Campaign confirmation"}>
      <h3>{preview.bot_key === "yoga" ? "Yoga Ganster" : "SAFRWAY"} · #{preview.campaign_id}</h3>
      <p>{ru ? "Контактов в зафиксированном списке:" : "Contacts in the fixed snapshot:"} {preview.recipient_count}. {preview.kind === "welcome_backfill" && (ru ? "Уже получившие приветствие повторно его не получат." : "Previously welcomed contacts will not receive it again.")}</p>
      {preview.kind === "welcome_backfill" && <p>{ru ? "Подтверждение также включит приветствия новым контактам. При изменении списка или версии сервер запросит новый предпросмотр; сам список не расширится." : "Confirmation also enables welcomes for new contacts. Audience or policy changes require a fresh preview; recipients are never silently added."}</p>}
      <details><summary>{ru ? "Точный текст и версия" : "Exact copy and version"}</summary>
        {(["ru", "en"] as const).map(language => <article className="am-copy-preview" key={language}><h4>{language === "ru" ? "Русский" : "English"}</h4>
          {(preview.message_previews?.[language]?.parts ?? [String(preview.content[language] ?? "")]).map((part, index) => <p key={index} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{part}</p>)}
          {preview.followup_enabled && <p style={{ whiteSpace: "pre-wrap" }}>{preview.message_previews?.[language]?.followup_text}</p>}
        </article>)}<small>v{preview.content_version ?? "—"} · {preview.snapshot_sha256}</small></details>
      <details><summary>{ru ? "Точный список" : "Exact recipients"}</summary>{recipients.map(person => <p key={person.user_id}>#{person.user_id} · {person.name} · {person.username ? `@${person.username}` : ""} · {person.locale}</p>)}</details>
      <label><input type="checkbox" disabled={locked} checked={approved} onChange={e => setApproved(e.target.checked)}/>{ru ? "Проверил бренд, оба текста и список. Подтверждаю эту отправку." : "I reviewed the brand, both texts and recipients. I confirm this send."}</label>
      {(preview.unverified_main_registration_count ?? 0) > 0 && <label><input type="checkbox" disabled={locked} checked={legacyApproved} onChange={e => setLegacyApproved(e.target.checked)}/>{ru ? `Разрешаю одну попытку приветствия ${preview.unverified_main_registration_count} старым Main-регистрациям: личный диалог и доставка не подтверждены. Это не включает их в следующие рассылки.` : `I authorize one welcome attempt to ${preview.unverified_main_registration_count} legacy Main registrations: private reachability is unconfirmed. This does not opt them into future campaigns.`}</label>}
      <button className="am-primary" disabled={locked || !approved || preview.recipient_count === 0 || (preview.unverified_main_registration_count ?? 0) > 0 && !legacyApproved} onClick={() => void confirm()}>{ru ? "Подтвердить и поставить в очередь" : "Confirm and queue"}</button>
    </section>}
    <h3>{ru ? "Кампании и результаты" : "Campaigns and results"}</h3>
    <button disabled={busy} onClick={() => void run(refresh)}>{ru ? "Обновить результаты" : "Refresh results"}</button>
    {campaigns.map(row => <article className="am-campaign-result" key={row.id}><p>#{row.id} · {row.bot_key === "yoga" ? "Yoga Ganster" : "SAFRWAY"} · {row.title} · {stateLabel(row.state, ru)}</p><p>{Object.entries(row.counts).map(([state, count]) => `${stateLabel(state, ru)}: ${count}`).join(" · ")}</p>
      <button disabled={busy} onClick={() => void run(async () => { const result = await request<{ items: Recipient[] }>(`${BASE}/campaigns/${row.id}/recipients`); if (live.current) setResultRecipients({ campaignId: row.id, items: result.items }); })}>{ru ? "Результаты по получателям" : "Recipient results"}</button>
      {!["CANCELLED", "COMPLETE"].includes(row.state) && <button className="am-danger" disabled={busy || attempt !== null} onClick={() => void run(async () => { await request(`${BASE}/campaigns/${row.id}/cancel`, { expected_revision: row.revision }); await refresh(); setNotice(ru ? "Оставшиеся отправки отменены. Уже отправленное сохранено в истории." : "Remaining sends cancelled. Sent history is preserved."); })}>{ru ? "Отменить оставшиеся" : "Cancel remaining"}</button>}
    </article>)}
    {resultRecipients && <section className="am-recipient-results" aria-label={ru ? "Результаты отдельной кампании" : "Separate campaign results"}><h3>#{resultRecipients.campaignId}</h3>{resultRecipients.items.map(person => <p key={person.user_id}>#{person.user_id} {person.name}: {stateLabel(person.state, ru)} · {Object.entries(person.deliveries).map(([state, count]) => `${stateLabel(state, ru)}:${count}`).join(" · ")}</p>)}</section>}
  </section>;
}
