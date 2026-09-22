import { useEffect, useMemo, useRef, useState } from "react";
import { AdminDialog } from "./AdminDialog";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";

import { radialReferralLayout, type ReferralData as GraphData } from "./referral-layout";

type CorrectionPreview = { child_user_id: number; previous_parent_user_id?: number; new_parent_user_id: number; referral_row_id?: number; reward_ledger_rows: number; conflicts: string[]; executable: boolean };

export function AdminReferralGraph({ locale, csrfToken }: { locale: "ru" | "en"; csrfToken: string }) {
  const [data, setData] = useState<GraphData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(.85);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [singlesOpen, setSinglesOpen] = useState(false);
  const [size, setSize] = useState({ width: 1000, height: 620 });
  const [childId, setChildId] = useState(""); const [inviterId, setInviterId] = useState(""); const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ data: CorrectionPreview; idempotencyKey: string } | null>(null); const [correcting, setCorrecting] = useState(false);
  const [confirmed, setConfirmed] = useState(false); const [outcome, setOutcome] = useState("");
  const graph = useMemo(() => data ? radialReferralLayout(data) : null, [data]);

  useEffect(() => {
    if (state !== "ready" || !viewportRef.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewportRef.current); return () => observer.disconnect();
  }, [state]);
  const singletons = useMemo(() => [...(graph?.nodes.find(n=>n.members)?.members ?? [])].sort((a,b)=>Number(b.has_registered_services===true)-Number(a.has_registered_services===true)||a.label.localeCompare(b.label,locale)), [graph,locale]);
  const fit = graph ? Math.min(1, size.width / (graph.extentX * 2), size.height / (graph.extentY * 2)) : 1;
  const scale = zoom;
  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

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
      <button type="button" onClick={() => setZoom((value) => Math.min(4, value + .25))} aria-label={locale === "ru" ? "Увеличить" : "Zoom in"}>＋</button>
      <button type="button" onClick={() => setZoom((value) => Math.max(.15, value - .25))} aria-label={locale === "ru" ? "Уменьшить" : "Zoom out"}>−</button>
      <button type="button" onClick={() => setOffset((value) => ({ ...value, x: value.x + 80 }))} aria-label={locale === "ru" ? "Посмотреть левее" : "Look left"}>←</button>
      <button type="button" onClick={() => setOffset((value) => ({ ...value, x: value.x - 80 }))} aria-label={locale === "ru" ? "Посмотреть правее" : "Look right"}>→</button>
      <button type="button" onClick={() => { setZoom(fit); setOffset({ x: 0, y: 0 }); }}>{locale === "ru" ? "Вписать" : "Fit"}</button>
      <button type="button" onClick={() => { setZoom(.85); setOffset({ x: 0, y: 0 }); }}>{locale === "ru" ? "Сбросить" : "Reset"}</button>
    </div>
    {data.truncated && <p className="admin-risk">{locale === "ru" ? "Показана первая безопасная выборка; полный список доступен ниже постранично." : "The safe graph sample is truncated; the full paginated list remains below."}</p>}
    <p className="admin-service-legend"><span aria-hidden="true" />{locale === "ru" ? "Зелёная рамка — оформлены услуги" : "Green border — registered services"}</p>
    <p className="admin-graph-hint">{locale === "ru" ? "Зажмите и потяните холст · Нажмите на клиента, чтобы открыть профиль" : "Drag the canvas · Select a client to open their profile"}</p>
    <div ref={viewportRef} className={`admin-graph-viewport admin-graph-canvas${dragging ? " is-dragging" : ""}`} tabIndex={0} aria-label={locale === "ru" ? "Схема реферальных связей. Перемещение стрелками клавиатуры." : "Referral map. Use arrow keys to pan."}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return;
        suppressClick.current = false;
        drag.current = { id:event.pointerId,x:event.clientX,y:event.clientY,originX:offset.x,originY:offset.y,moved:false };
      }}
      onPointerMove={(event) => {
        const start=drag.current; if(!start || start.id!==event.pointerId) return;
        const dx=event.clientX-start.x,dy=event.clientY-start.y;
        if(!start.moved && Math.hypot(dx,dy)<5) return;
        start.moved=true;setDragging(true);event.currentTarget.setPointerCapture(event.pointerId);
        setOffset({x:start.originX+dx,y:start.originY+dy});
      }}
      onPointerUp={endDrag} onPointerCancel={(event)=>{endDrag(event);suppressClick.current=false;}} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}
      onPointerLeave={(event)=>{if(drag.current && !drag.current.moved) endDrag(event);}}
      onClickCapture={(event)=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}
      onKeyDown={(event)=>{if(event.target!==event.currentTarget)return;const step=60;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();setOffset(p=>({x:p.x+(event.key==='ArrowLeft'?step:event.key==='ArrowRight'?-step:0),y:p.y+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0)}));}}}>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-labelledby="referral-svg-title">
        <title id="referral-svg-title">{locale === "ru" ? "Клиенты и связи приглашений" : "Clients and invitation links"}</title>
        <g className="admin-graph-camera" transform={`translate(${size.width/2+offset.x} ${size.height/2+offset.y}) scale(${scale})`}>
          {[240,480,720].map(r=><circle key={r} className="admin-graph-orbit" r={r} />)}
          {graph.edges.map(edge=>{const parent=graph.nodes.find(n=>n.key===edge.from);const child=graph.nodes.find(n=>n.key===edge.to);return parent&&child?<line key={edge.from+':'+edge.to} x1={parent.x} y1={parent.y} x2={child.x} y2={child.y}/>:null;})}
          {graph.nodes.map(node=>{
            const label=node.members ? (locale === "ru" ? `Одиночки · ${node.members.length}` : `Single referrals · ${node.members.length}`) : node.label;
            const activate=()=>node.members ? setSinglesOpen(v=>!v) : node.id!==undefined && openClient(node.id);
            return <g key={node.key} className={`admin-graph-node${node.root?' is-root':''}${node.members?' is-group':''}${node.has_registered_services?' has-services':''}`} transform={`translate(${node.x} ${node.y})`} onFocus={()=>{const x=size.width/2+offset.x+node.x*scale,y=size.height/2+offset.y+node.y*scale;if(x-110*scale<0||x+110*scale>size.width||y-40*scale<0||y+40*scale>size.height)setOffset({x:-node.x*scale,y:-node.y*scale});}} onClick={activate} role={node.members?'button':'link'} tabIndex={0} aria-expanded={node.members?singlesOpen:undefined} aria-controls={node.members?'referral-singletons':undefined} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}}} aria-label={label}>
              {node.root ? <circle className="admin-graph-root-halo" r="86"/> : null}
              <rect x="-105" y="-32" width="210" height="64" rx={node.root?'24':'14'}/><title>{label}</title>
              <text textAnchor="middle" y="-4">{label.length>25?label.slice(0,24)+'…':label}</text>
              <text textAnchor="middle" y="17" className="admin-graph-id">{node.members?(locale==='ru'?'Показать участников':'Show members'):node.root?(locale==='ru'?'Центр сети':'Network root'):`SAFRWAY ${node.id}`}</text>
            </g>;
          })}
        </g>
      </svg>
    </div>
    {singlesOpen && <AdminDialog labelledBy="referral-singletons-title" className="admin-singleton-dialog" onClose={()=>setSinglesOpen(false)}>
      <header className="admin-singleton-header"><div><span className="eyebrow">{locale==='ru'?'Без своей реферальной ветки':'Without their own referral branch'}</span><h2 id="referral-singletons-title">{locale==='ru'?'Одиночные рефералы':'Single referrals'} · {singletons.length}</h2><p>{locale==='ru'?'Сначала — клиенты с оформленными услугами':'Clients with registered services appear first'}</p></div><button type="button" className="crm-delete-x" aria-label={locale==='ru'?'Закрыть одиночек':'Close single referrals'} onClick={()=>setSinglesOpen(false)}>×</button></header>
      <div className="admin-singleton-grid" id="referral-singletons">{singletons.map(n=><button type="button" className={n.has_registered_services?'has-services':''} key={n.id} onClick={()=>{setSinglesOpen(false);openClient(n.id);}}><span className="admin-singleton-avatar" aria-hidden="true">{n.label.split(/\s+/).slice(0,2).map(part=>part[0]).join('')}</span><strong>{n.label}</strong><small>SAFRWAY {n.id}</small>{n.has_registered_services?<span className="admin-service-marker">{locale==='ru'?'Есть услуги':'Has services'}</span>:<span className="admin-service-none">{locale==='ru'?'Без оформленных услуг':'No registered services'}</span>}</button>)}</div>
    </AdminDialog>}
    <details className="admin-graph-fallback"><summary>{locale === "ru" ? "Доступный список связей" : "Accessible relationship list"}</summary><ul>{data.edges.map((edge) => { const parent = data.nodes.find((node) => node.id === edge.parent_id); const child = data.nodes.find((node) => node.id === edge.child_id); return <li key={edge.id}><button type="button" onClick={() => openClient(edge.child_id)}>{parent?.label ?? "—"} → {child?.label ?? "—"}</button></li>; })}</ul></details>
    <details className="admin-referral-correction"><summary>{locale === "ru" ? "Исправить подтверждённую атрибуцию" : "Correct verified attribution"}</summary><form onSubmit={previewCorrection}><p className="admin-risk">{locale === "ru" ? "Только по проверенному основанию. Баллы, заказы, даты регистрации и сообщения не меняются; конфликт блокирует запись." : "Verified evidence only. Points, orders, join dates, and messages remain unchanged; any conflict blocks the write."}</p><div className="admin-setting-fields"><label>{locale === "ru" ? "SAFRWAY ID клиента" : "Client SAFRWAY ID"}<input type="number" min="1" required value={childId} onChange={(event) => { setChildId(event.target.value); setPreview(null); setOutcome(""); }} /></label><label>{locale === "ru" ? "SAFRWAY ID нового пригласившего" : "New inviter SAFRWAY ID"}<input type="number" min="1" required value={inviterId} onChange={(event) => { setInviterId(event.target.value); setPreview(null); setOutcome(""); }} /></label></div><button type="submit" disabled={correcting || !childId || !inviterId}>{locale === "ru" ? "Проверить без записи" : "Preview without writing"}</button></form>{outcome && <div className="admin-outcome" role="status" aria-live="polite">{outcome}</div>}{preview && <section className="admin-settings-preview" aria-live="polite"><h3>{locale === "ru" ? "Предварительная проверка" : "Correction preview"}</h3><dl><div><dt>{locale === "ru" ? "Было" : "Before"}</dt><dd>SAFRWAY {preview.data.previous_parent_user_id ?? "—"}</dd></div><div><dt>{locale === "ru" ? "Станет" : "After"}</dt><dd>SAFRWAY {preview.data.new_parent_user_id}</dd></div><div><dt>{locale === "ru" ? "Операции наград" : "Reward ledger rows"}</dt><dd>{preview.data.reward_ledger_rows}</dd></div></dl>{preview.data.conflicts.length > 0 ? <div className="admin-alert" role="alert">{preview.data.conflicts.join(", ")}</div> : <><label>{locale === "ru" ? "Основание и причина" : "Evidence and reason"}<textarea minLength={3} required value={reason} onChange={(event) => { setReason(event.target.value); setConfirmed(false); }} /></label><label className="crm-toggle-row"><span><strong>{locale === "ru" ? "Подтверждаю проверенное основание" : "I confirm the verified evidence"}</strong><small>{locale === "ru" ? "Будет изменена только одна реферальная связь с неизменяемым аудитом." : "Only one referral relationship changes with immutable audit evidence."}</small></span><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /></label><button className="danger" type="button" disabled={correcting || reason.trim().length < 3 || !confirmed} onClick={() => void applyCorrection()}>{correcting ? (locale === "ru" ? "Применяем…" : "Applying…") : (locale === "ru" ? "Применить одну коррекцию" : "Apply one correction")}</button></>}</section>}</details>
  </section>;
}
