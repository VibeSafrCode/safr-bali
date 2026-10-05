import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiErrorMessage, appApiClient } from '../api/client';
import { nextRawAnalyticsCursor, ownerAnalyticsControls, readAnalyticsOverview, readRawAnalytics } from '../utils/admin-analytics';
import type { AnalyticsAggregate, AnalyticsPolicy, AnalyticsRawPage } from '../utils/admin-analytics';
import allowlist from '../../../shared/content/analytics-allowlist.v1.json';
import './admin-analytics.css';

const denied = (error: unknown) => error instanceof ApiError && error.status === 403;

export function AdminAnalytics({ locale, csrfToken }: { locale: 'ru' | 'en'; csrfToken: string }) {
  const en = locale === 'en';
  const [policy, setPolicy] = useState<AnalyticsPolicy | null>(null);
  const [rows, setRows] = useState<AnalyticsAggregate[]>([]);
  const [scope, setScope] = useState('');
  const [aggregateError, setAggregateError] = useState('');
  const [policyError, setPolicyError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verified, setVerified] = useState(false);
  const [start, setStart] = useState(() => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [notice, setNotice] = useState('privacy-2026-10-05');
  const [rawPage, setRawPage] = useState<AnalyticsRawPage | null>(null);
  const [rawAfter, setRawAfter] = useState(0);
  const [rawBusy, setRawBusy] = useState(false);
  const [rawError, setRawError] = useState('');
  const [rawDenied, setRawDenied] = useState(false);
  const mounted = useRef(false);
  const overviewAbort = useRef<AbortController | null>(null);
  const rawAbort = useRef<AbortController | null>(null);
  const saveAbort = useRef<AbortController | null>(null);

  const loadOverview = useCallback(async () => {
    overviewAbort.current?.abort();
    const controller = new AbortController();
    overviewAbort.current = controller;
    setBusy(true); setAggregateError(''); setPolicyError(''); setRows([]); setScope(''); setPolicy(null);
    try {
      const result = await readAnalyticsOverview(appApiClient().request, start, end, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (result.aggregates.status === 'fulfilled') {
        setRows(result.aggregates.value.items); setScope(result.aggregates.value.scope);
      } else setAggregateError(apiErrorMessage(result.aggregates.reason));
      if (result.policy.status === 'fulfilled') {
        setPolicy(result.policy.value); setNotice(result.policy.value.privacy_notice_version ?? 'privacy-2026-10-05');
      } else if (!denied(result.policy.reason)) setPolicyError(apiErrorMessage(result.policy.reason));
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setAggregateError(apiErrorMessage(error));
    } finally {
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  }, [start, end]);

  const loadRaw = useCallback(async (afterId: number) => {
    rawAbort.current?.abort();
    const controller = new AbortController();
    rawAbort.current = controller;
    setRawBusy(true); setRawPage(null); setRawError(''); setRawDenied(false);
    // Each request replaces a bounded page; events are never appended.
    try {
      const page = await readRawAnalytics(appApiClient().request, afterId, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setRawPage(page); setRawAfter(afterId);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      if (denied(error)) setRawDenied(true); else setRawError(apiErrorMessage(error));
    } finally {
      if (mounted.current && !controller.signal.aborted) setRawBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      overviewAbort.current?.abort(); rawAbort.current?.abort(); saveAbort.current?.abort();
    };
  }, []);
  useEffect(() => { if (start && end && start <= end) void loadOverview(); }, [start, end, loadOverview]);
  useEffect(() => { void loadRaw(0); }, [loadRaw]);

  async function save(enabled: boolean) {
    if (!policy || scope !== 'owner' || saving || busy) return;
    saveAbort.current?.abort();
    const controller = new AbortController();
    saveAbort.current = controller;
    setSaving(true); setSaveError('');
    try {
      await appApiClient().request('/api/web/admin/analytics/policy', {
        method: 'PUT', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ expected_revision: policy.policy_revision, enabled, privacy_notice_version: notice,
          consent_ui_verified: verified,
          allowed_content_ids: policy.allowed_content_ids?.length ? policy.allowed_content_ids : allowlist.contentIds,
          allowed_service_ids: policy.allowed_service_ids?.length ? policy.allowed_service_ids : allowlist.serviceIds,
          allowed_campaign_codes: policy.allowed_campaign_codes ?? [] }),
      });
      if (!mounted.current || controller.signal.aborted) return;
      setVerified(false); await loadOverview();
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setSaveError(apiErrorMessage(error));
    } finally {
      if (mounted.current && !controller.signal.aborted) setSaving(false);
    }
  }

  const nextCursor = nextRawAnalyticsCursor(rawPage, rawAfter);
  const ownerControls = ownerAnalyticsControls(scope, policy);
  const accessLabel = scope === 'owner' ? (en ? 'Owner' : 'Владелец') : scope === 'assigned_services' ? (en ? 'Assigned services' : 'Назначенные услуги') : '—';
  return <section className="admin-panel admin-analytics" aria-labelledby="analytics-heading">
    <h2 id="analytics-heading">{en ? 'First-party analytics' : 'Собственная аналитика'}</h2>
    <p>{en ? 'Consent-only, no client messages or contact details. Raw events: 13 months; aggregates: 3 years. Disabled until privacy and migration gates pass.' : 'Только с согласия пользователя, без сообщений и контактов клиентов. События: 13 месяцев, агрегаты: 3 года. По умолчанию отключена до проверки privacy и миграции.'}</p>
    {aggregateError ? <p role="alert">{aggregateError}</p> : null}
    {saveError ? <p role="alert">{saveError}</p> : null}
    <div className="business-filters">
      <label>{en ? 'From' : 'С'}<input type="date" disabled={saving} value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>{en ? 'To' : 'По'}<input type="date" disabled={saving} value={end} onChange={event => setEnd(event.target.value)} /></label>
      <button type="button" disabled={busy || saving || !start || !end || start > end} onClick={() => void loadOverview()}>{en ? 'Refresh' : 'Обновить'}</button>
    </div>
    <p>{en ? 'Access' : 'Доступ'}: {accessLabel} · {en ? 'Collection' : 'Сбор'}: {policy ? (policy.enabled ? (en ? 'enabled' : 'включён') : (en ? 'disabled' : 'выключен')) : (en ? 'owner settings unavailable' : 'настройки владельца недоступны')}</p>
    <div className="table-scroll" aria-busy={busy}><table>
      <caption>{en ? 'Summary for the selected period' : 'Сводка за период'}</caption>
      <thead><tr>{(en ? ['Date', 'Event', 'Service / content', 'Count', 'Amount'] : ['Дата', 'Событие', 'Услуга / материал', 'Количество', 'Сумма']).map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.day}-${row.event_name}-${index}`}><td>{row.day}</td><td>{row.event_name}</td><td>{row.service_id ?? row.content_id ?? '—'}</td><td>{row.event_count}</td><td>{row.currency ? `${row.amount_total ?? '0'} ${row.currency}` : '—'}</td></tr>)}</tbody>
    </table></div>
    {busy ? <p role="status">{en ? 'Loading aggregates…' : 'Загружаем агрегаты…'}</p> : !aggregateError && !rows.length ? <p>{en ? 'No accepted events in this period. Search Console requires a separate connection; no metrics are fabricated.' : 'За этот период принятых событий нет. Для Search Console потребуется отдельное подключение; метрики не подставляются.'}</p> : null}

    <section aria-labelledby="analytics-raw-heading" aria-busy={rawBusy}>
      <h3 id="analytics-raw-heading">{en ? 'Read-only event history' : 'История событий — только просмотр'}</h3>
      {rawBusy ? <p role="status">{en ? 'Loading event history…' : 'Загружаем историю событий…'}</p> : null}
      {rawDenied ? <p role="status">{en ? 'Event history is not available to this account. This does not affect permitted aggregates.' : 'История событий недоступна этому аккаунту. Доступные агрегаты показываются независимо.'}</p> : null}
      {rawError ? <p role="alert">{rawError}</p> : null}
      {rawPage ? <>
        {rawPage.scope === 'technical_only' && <p>{en ? 'Technical view; financial events excluded.' : 'Технический просмотр: финансовые события не показываются.'}</p>}
        <div className="table-scroll"><table>
          <caption>{en ? 'Up to 50 events; no client names, contacts, documents or messages' : 'До 50 событий; без имён, контактов, документов и сообщений клиентов'}</caption>
          <thead><tr>{(en ? ['Received (UTC)', 'Event', 'Service / content', 'Country / language', 'Browser / device', 'Pseudonymous session', 'Amount'] : ['Получено (UTC)', 'Событие', 'Услуга / материал', 'Страна / язык', 'Браузер / устройство', 'Псевдоним сессии', 'Сумма']).map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rawPage.items.map(row => <tr key={row.id}>
            <td>{row.received_at}</td><td>{row.event_name}</td><td>{row.service_id ?? row.content_id ?? '—'}</td>
            <td>{[row.country, row.locale].filter(Boolean).join(' / ') || '—'}</td>
            <td>{[row.browser, row.device].filter(Boolean).join(' / ') || '—'}</td><td><code>{row.session_key}</code></td>
            <td>{row.amount != null && row.currency ? `${row.amount} ${row.currency}` : '—'}</td>
          </tr>)}</tbody>
        </table></div>
        {!rawPage.items.length ? <p>{en ? 'No events on this page.' : 'На этой странице событий нет.'}</p> : null}
        <nav className="business-entity-actions" aria-label={en ? 'Event history pagination' : 'Страницы истории событий'}>
          <button type="button" disabled={rawBusy || rawAfter === 0} onClick={() => void loadRaw(0)}>{en ? 'First page' : 'Первая страница'}</button>
          <button type="button" disabled={rawBusy || nextCursor === null} onClick={() => { if (nextCursor !== null) void loadRaw(nextCursor); }}>{en ? 'Next 50 events' : 'Следующие 50 событий'}</button>
          <button type="button" disabled={rawBusy} onClick={() => void loadRaw(rawAfter)}>{en ? 'Refresh history' : 'Обновить историю'}</button>
        </nav>
      </> : null}
    </section>

    {scope === 'owner' && policyError ? <p role="alert">{policyError}</p> : null}
    {ownerControls && policy ? <details>
      <summary>{en ? 'Owner collection settings' : 'Настройки сбора для владельца'}</summary>
      <label>{en ? 'Privacy notice version' : 'Версия уведомления о данных'}<input disabled={saving} value={notice} maxLength={64} onChange={event => setNotice(event.target.value)} /></label>
      <label><input type="checkbox" disabled={saving} checked={verified} onChange={event => setVerified(event.target.checked)} />{en ? 'Privacy notice, consent UI and migration verified' : 'Политика, интерфейс согласия и миграция проверены'}</label>
      <div className="business-entity-actions">
        <button type="button" disabled={busy || saving || !verified || !notice} onClick={() => void save(true)}>{en ? 'Enable collection' : 'Включить сбор'}</button>
        <button type="button" disabled={busy || saving || !policy.enabled} onClick={() => void save(false)}>{en ? 'Disable collection' : 'Выключить сбор'}</button>
      </div>
    </details> : null}
  </section>;
}
