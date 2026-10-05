export type AnalyticsPolicy = { enabled: boolean; policy_revision: number; privacy_notice_version: string | null; allowed_content_ids?: string[]; allowed_service_ids?: string[]; allowed_campaign_codes?: string[] };
export type AnalyticsAggregate = { day: string; event_name: string; content_id?: string; service_id?: string; event_count: number; currency?: string; amount_total?: string };
export type AnalyticsAggregates = { items: AnalyticsAggregate[]; scope: 'owner' | 'assigned_services' };
export type AnalyticsRawEvent = {
  id: number; event_key: string; session_key: string; received_at: string; event_name: string;
  content_id?: string | null; service_id?: string | null; country?: string | null; locale?: string | null;
  browser?: string | null; device?: string | null; channel?: string | null; amount?: string | null; currency?: string | null;
};
export type AnalyticsRawPage = { items: AnalyticsRawEvent[]; next_after_id: number; scope: 'owner' | 'technical_only' };
type AnalyticsRequest = <T>(path: string, options?: RequestInit) => Promise<T>;

export function ownerAnalyticsControls(scope: string, policy: AnalyticsPolicy | null): boolean {
  return scope === 'owner' && policy !== null;
}

export async function readAnalyticsOverview(request: AnalyticsRequest, start: string, end: string, signal?: AbortSignal) {
  // Independent permissions: a denied owner policy must not discard staff metrics.
  const [policy, aggregates] = await Promise.allSettled([
    request<AnalyticsPolicy>('/api/web/admin/analytics/policy', { signal }),
    request<AnalyticsAggregates>(`/api/web/admin/analytics/aggregates?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { signal }),
  ]);
  return { policy, aggregates };
}

export async function readRawAnalytics(request: AnalyticsRequest, afterId: number, signal?: AbortSignal): Promise<AnalyticsRawPage> {
  const page = await request<AnalyticsRawPage>(`/api/web/admin/analytics/events?after_id=${afterId}&limit=50`, { signal });
  if (!page || !Array.isArray(page.items) || page.items.length > 50 ||
      !Number.isSafeInteger(page.next_after_id) || page.next_after_id < afterId ||
      !['owner', 'technical_only'].includes(page.scope)) throw new Error('Invalid analytics history response');
  return page;
}

export function nextRawAnalyticsCursor(page: AnalyticsRawPage | null, afterId: number): number | null {
  // No has-more claim for short pages, and never request a non-advancing cursor.
  return page && page.items.length === 50 && page.next_after_id > afterId ? page.next_after_id : null;
}
