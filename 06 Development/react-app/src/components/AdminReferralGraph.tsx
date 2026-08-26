import { useEffect, useMemo, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";

type GraphNode = { id: number; label: string };
type GraphEdge = { id: number; parent_id: number; child_id: number; source?: string };
type GraphData = { nodes: GraphNode[]; edges: GraphEdge[]; total_edges: number; truncated: boolean };
type CorrectionPreview = { child_user_id: number; previous_parent_user_id?: number; new_parent_user_id: number; referral_row_id?: number; reward_ledger_rows: number; conflicts: string[]; executable: boolean };

function layout(data: GraphData) {
  const parents = new Map(data.edges.map((edge) => [edge.child_id, edge.parent_id]));
  const depth = (id: number) => {
    let current = id; let value = 0; const visited = new Set<number>();
    while (parents.has(current) && !visited.has(current)) { visited.add(current); current = parents.get(current)!; value += 1; }
    return value;
  };
  const levels = new Map<number, GraphNode[]>();
  for (const node of data.nodes) { const level = depth(node.id); levels.set(level, [...(levels.get(level) ?? []), node]); }
  const positions = new Map<number, { x: number; y: number }>();
  for (const [level, nodes] of [...levels].sort(([a], [b]) => a - b)) {
    nodes.sort((a, b) => a.label.localeCompare(b.label)).forEach((node, index) => positions.set(node.id, { x: 40 + level * 210, y: 40 + index * 92 }));
  }
  const width = Math.max(520, ...[...positions.values()].map((point) => point.x + 190));
  const height = Math.max(280, ...[...positions.values()].map((point) => point.y + 70));
  return { positions, width, height };
}

export function AdminReferralGraph({ locale, csrfToken }: { locale: "ru" | "en"; csrfToken: string }) {
  const [data, setData] = useState<GraphData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [childId, setChildId] = useState(""); const [inviterId, setInviterId] = useState(""); const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ data: CorrectionPreview; idempotencyKey: string } | null>(null); const [correcting, setCorrecting] = useState(false);
  const [confirmed, setConfirmed] = useState(false); const [outcome, setOutcome] = useState("");
  const graph = useMemo(() => data ? layout(data) : null, [data]);

  async function load(showLoading = true) {
    if (showLoading) setState("loading");
    setError("");
    try { setData(await appApiClient().request<GraphData>("/api/web/admin/referrals/graph")); setState("ready"); }
    catch (caught) { setError(apiErrorMessage(caught)); setState("error"); }
  }

  useEffect(() => { void load(); }, []);
  const openClient = (id: number) => { window.history.pushState({ safrClientDetail: true }, "", `/admin/clients/${id}/`); window.dispatchEvent(new PopStateEvent("popstate")); };
  async function previewCorrection(event: React.FormEvent) {
    event.preventDefault(); setError(""); setOutcome(""); setConfirmed(false); setCorrecting(true);
    try { const result = await appApiClient().request<CorrectionPreview>(`/api/web/admin/referrals/correction-preview?child_user_id=${Number(childId)}&new_parent_user_id=${Number(inviterId)}`); setPreview({ data: result, idempotencyKey: crypto.randomUUID() }); }
    catch (caught) { setPreview(null); setError(apiErrorMessage(caught)); }
    finally { setCorrecting(false); }
  }
  async function applyCorrection() {
    if (!preview?.data.executable || reason.trim().length < 3 || !confirmed || correcting) return;
    setCorrecting(true); setError("");
    try {
      await appApiClient().request("/api/web/admin/referrals/corrections", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ child_user_id: preview.data.child_user_id, new_parent_user_id: preview.data.new_parent_user_id, reason: reason.trim(), idempotency_key: preview.idempotencyKey }) });
      setPreview(null); setChildId(""); setInviterId(""); setReason(""); setConfirmed(false);
      setOutcome(locale === "ru" ? "Атрибуция исправлена. Награды, заказы и дата регистрации не изменены." : "Attribution corrected. Rewards, orders, and join date were unchanged.");
      await load(false);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 409
        ? (locale === "ru" ? "Связь изменилась; запись не выполнена. Обновите проверку и повторите." : "Relationship changed; nothing was written. Refresh the preview and retry.")
        : (locale === "ru" ? apiErrorMessage(caught) : "Could not apply the correction. Nothing was written; retry."));
    }
    finally { setCorrecting(false); }
  }
  if (state === "loading") return <div className="admin-empty" role="status">{locale === "ru" ? "Строим реферальную схему…" : "Building referral graph…"}</div>;
  if (state === "error" || !data || !graph) return <div className="admin-empty" role="alert"><p>{error || (locale === "ru" ? "Схема недоступна." : "Graph unavailable.")}</p><button type="button" onClick={() => void load()}>{locale === "ru" ? "Повторить" : "Retry"}</button></div>;
  return <section className="admin-referral-graph" aria-labelledby="referral-graph-title">
    <div className="admin-panel-head"><div><span className="eyebrow">{locale === "ru" ? "Интерактивная схема" : "Interactive map"}</span><h2 id="referral-graph-title">{locale === "ru" ? "Реферальная сеть" : "Referral network"}</h2></div><span>{data.total_edges} {locale === "ru" ? "связей" : "links"}</span></div>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    <div className="admin-graph-tools" aria-label={locale === "ru" ? "Управление схемой" : "Graph controls"}>
      <button type="button" onClick={() => setZoom((value) => Math.min(2, value + .2))} aria-label={locale === "ru" ? "Увеличить" : "Zoom in"}>＋</button>
      <button type="button" onClick={() => setZoom((value) => Math.max(.5, value - .2))} aria-label={locale === "ru" ? "Уменьшить" : "Zoom out"}>−</button>
      <button type="button" onClick={() => setOffset((value) => ({ ...value, x: value.x + 80 }))} aria-label={locale === "ru" ? "Сдвинуть вправо" : "Pan right"}>←</button>
      <button type="button" onClick={() => setOffset((value) => ({ ...value, x: value.x - 80 }))} aria-label={locale === "ru" ? "Сдвинуть влево" : "Pan left"}>→</button>
      <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>{locale === "ru" ? "Вписать" : "Fit"}</button>
      <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>{locale === "ru" ? "Сбросить" : "Reset"}</button>
    </div>
    {data.truncated && <p className="admin-risk">{locale === "ru" ? "Показана первая безопасная выборка; полный список доступен ниже постранично." : "The safe graph sample is truncated; the full paginated list remains below."}</p>}
    <div className="admin-graph-viewport" tabIndex={0} aria-label={locale === "ru" ? "Схема реферальных связей" : "Referral relationship graph"}>
      <svg viewBox={`0 0 ${graph.width} ${graph.height}`} role="img" aria-labelledby="referral-svg-title">
        <title id="referral-svg-title">{locale === "ru" ? "Клиенты и связи приглашений" : "Clients and invitation links"}</title>
        <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
          {data.edges.map((edge) => { const parent = graph.positions.get(edge.parent_id); const child = graph.positions.get(edge.child_id); return parent && child ? <line key={edge.id} x1={parent.x + 160} y1={parent.y + 27} x2={child.x} y2={child.y + 27} /> : null; })}
          {data.nodes.map((node) => { const point = graph.positions.get(node.id); return point ? <g key={node.id} className="admin-graph-node" transform={`translate(${point.x} ${point.y})`} onClick={() => openClient(node.id)} role="link" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openClient(node.id); } }} aria-label={`${node.label}. ${locale === "ru" ? "Открыть клиента" : "Open client"}`}><rect width="160" height="54" rx="12" /><text x="12" y="24">{node.label.slice(0, 22)}</text><text x="12" y="41" className="admin-graph-id">SAFRWAY {node.id}</text></g> : null; })}
        </g>
      </svg>
    </div>
    <details className="admin-graph-fallback"><summary>{locale === "ru" ? "Доступный список связей" : "Accessible relationship list"}</summary><ul>{data.edges.map((edge) => { const parent = data.nodes.find((node) => node.id === edge.parent_id); const child = data.nodes.find((node) => node.id === edge.child_id); return <li key={edge.id}><button type="button" onClick={() => openClient(edge.child_id)}>{parent?.label ?? "—"} → {child?.label ?? "—"}</button></li>; })}</ul></details>
    <details className="admin-referral-correction"><summary>{locale === "ru" ? "Исправить подтверждённую атрибуцию" : "Correct verified attribution"}</summary><form onSubmit={previewCorrection}><p className="admin-risk">{locale === "ru" ? "Только по проверенному основанию. Баллы, заказы, даты регистрации и сообщения не меняются; конфликт блокирует запись." : "Verified evidence only. Points, orders, join dates, and messages remain unchanged; any conflict blocks the write."}</p><div className="admin-setting-fields"><label>{locale === "ru" ? "SAFRWAY ID клиента" : "Client SAFRWAY ID"}<input type="number" min="1" required value={childId} onChange={(event) => { setChildId(event.target.value); setPreview(null); setOutcome(""); }} /></label><label>{locale === "ru" ? "SAFRWAY ID нового пригласившего" : "New inviter SAFRWAY ID"}<input type="number" min="1" required value={inviterId} onChange={(event) => { setInviterId(event.target.value); setPreview(null); setOutcome(""); }} /></label></div><button type="submit" disabled={correcting || !childId || !inviterId}>{locale === "ru" ? "Проверить без записи" : "Preview without writing"}</button></form>{outcome && <div className="admin-outcome" role="status" aria-live="polite">{outcome}</div>}{preview && <section className="admin-settings-preview" aria-live="polite"><h3>{locale === "ru" ? "Предварительная проверка" : "Correction preview"}</h3><dl><div><dt>{locale === "ru" ? "Было" : "Before"}</dt><dd>SAFRWAY {preview.data.previous_parent_user_id ?? "—"}</dd></div><div><dt>{locale === "ru" ? "Станет" : "After"}</dt><dd>SAFRWAY {preview.data.new_parent_user_id}</dd></div><div><dt>{locale === "ru" ? "Операции наград" : "Reward ledger rows"}</dt><dd>{preview.data.reward_ledger_rows}</dd></div></dl>{preview.data.conflicts.length > 0 ? <div className="admin-alert" role="alert">{preview.data.conflicts.join(", ")}</div> : <><label>{locale === "ru" ? "Основание и причина" : "Evidence and reason"}<textarea minLength={3} required value={reason} onChange={(event) => { setReason(event.target.value); setConfirmed(false); }} /></label><label className="crm-toggle-row"><span><strong>{locale === "ru" ? "Подтверждаю проверенное основание" : "I confirm the verified evidence"}</strong><small>{locale === "ru" ? "Будет изменена только одна реферальная связь с неизменяемым аудитом." : "Only one referral relationship changes with immutable audit evidence."}</small></span><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /></label><button className="danger" type="button" disabled={correcting || reason.trim().length < 3 || !confirmed} onClick={() => void applyCorrection()}>{correcting ? (locale === "ru" ? "Применяем…" : "Applying…") : (locale === "ru" ? "Применить одну коррекцию" : "Apply one correction")}</button></>}</section>}</details>
  </section>;
}
