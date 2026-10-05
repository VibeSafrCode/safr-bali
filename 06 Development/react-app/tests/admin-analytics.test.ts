import assert from 'node:assert/strict';
import test from 'node:test';
import { nextRawAnalyticsCursor, ownerAnalyticsControls, readAnalyticsOverview, readRawAnalytics } from '../src/utils/admin-analytics';
import type { AnalyticsRawEvent, AnalyticsRawPage } from '../src/utils/admin-analytics';

test('denied owner policy leaves independently allowed staff aggregates intact', async () => {
  const forbidden = Object.assign(new Error('Forbidden'), { status: 403 });
  const calls: string[] = [];
  const aggregates = { items: [{ event_name: 'page_view', event_count: 5 }], scope: 'assigned_services' };
  const result = await readAnalyticsOverview(async <T>(path: string): Promise<T> => {
    calls.push(path);
    if (path.endsWith('/policy')) throw forbidden;
    return aggregates as T;
  }, '2026-10-01', '2026-10-05');
  assert.equal(calls.length, 2);
  assert.equal(result.policy.status, 'rejected');
  assert.equal(result.aggregates.status, 'fulfilled');
  if (result.aggregates.status === 'fulfilled') assert.equal(result.aggregates.value, aggregates);
});

test('raw history is permission-independent and page cursors never claim short/stalled pages continue', async () => {
  const row: AnalyticsRawEvent = { id: 50, event_key: 'opaque', session_key: 'pseudonym', received_at: '2026-10-05T12:00:00Z', event_name: 'page_view' };
  const page: AnalyticsRawPage = { items: Array.from({ length: 50 }, (_, i) => ({ ...row, id: i + 1 })), next_after_id: 50, scope: 'technical_only' };
  let called = '';
  assert.equal(await readRawAnalytics(async <T>(path: string): Promise<T> => { called = path; return page as T; }, 0), page);
  assert.equal(called, '/api/web/admin/analytics/events?after_id=0&limit=50');
  assert.equal(nextRawAnalyticsCursor(page, 0), 50);
  assert.equal(nextRawAnalyticsCursor(page, 50), null);
  assert.equal(nextRawAnalyticsCursor({ ...page, items: [row] }, 0), null);
  assert.equal(nextRawAnalyticsCursor(null, 0), null);
  await assert.rejects(readRawAnalytics(async <T>(): Promise<T> => ({ ...page, scope: 'staff' }) as T, 0));
  await assert.rejects(readRawAnalytics(async <T>(): Promise<T> => ({ ...page, items: Array(51).fill(row) }) as T, 0));
  await assert.rejects(readRawAnalytics(async <T>(): Promise<T> => { throw Object.assign(new Error('Forbidden'), { status: 403 }); }, 0));
});

test('owner controls require the verified aggregate owner scope, never just a readable policy', () => {
  const policy = { enabled: false, policy_revision: 1, privacy_notice_version: 'reviewed' };
  assert.equal(ownerAnalyticsControls('owner', policy), true);
  for (const scope of ['', 'assigned_services', 'technical_only', 'staff']) assert.equal(ownerAnalyticsControls(scope, policy), false);
  assert.equal(ownerAnalyticsControls('owner', null), false);
});
