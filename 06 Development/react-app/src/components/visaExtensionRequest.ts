import type { VisaCase } from '../api/types';

export type ExtensionKind = 'APPLIED' | 'RECEIVED';
export type PendingVisaExtension = {
  signature: string;
  body: { kind: ExtensionKind; reported_on: string; reported_stay_end: string | null; expected_version: number; idempotency_key: string };
};
export function canReportVisaExtension(item: Pick<VisaCase, 'version' | 'lifecycle_status'>): boolean {
  return Number.isSafeInteger(item.version) && (item.version ?? 0) > 0
    && ['ISSUED_NOT_ACTIVATED', 'ACTIVE', 'EXPIRING', 'EXTENSION_PROCESSING', 'EXTENDED', 'EXPIRED'].includes(item.lifecycle_status);
}
export function visaDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const n = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value;
}
export function visaBaliToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
// Server rechecks every date/owner/version. This is only a client draft and
// retry identity, never a legal extension or authorization decision.
export function prepareVisaExtensionRequest(previous: PendingVisaExtension | null,
  scope: '/mini-app' | '/api/web', item: Pick<VisaCase, 'id' | 'version' | 'issued_on' | 'stay_end'>,
  kind: ExtensionKind, reportedOn: string, reportedEnd: string, today: string,
  createKey: () => string): PendingVisaExtension {
  if (!['/mini-app', '/api/web'].includes(scope) || !Number.isSafeInteger(item.id) || item.id < 1
    || !Number.isSafeInteger(item.version) || (item.version ?? 0) < 1) throw new Error('VISA_EXTENSION_VERSION_REQUIRED');
  if (kind !== 'APPLIED' && kind !== 'RECEIVED') throw new Error('VISA_EXTENSION_KIND_INVALID');
  const end = kind === 'APPLIED' || reportedEnd === '' ? null : reportedEnd;
  const signature = JSON.stringify([scope, item.id, item.version, kind, reportedOn, end]);
  // Preserve an exact pending request even if a new clock day has begun.
  if (previous?.signature === signature) return previous;
  if (!visaDateOnly(today) || !visaDateOnly(reportedOn) || reportedOn > today
    || (item.issued_on && (!visaDateOnly(item.issued_on) || reportedOn < item.issued_on))) throw new Error('VISA_EXTENSION_DATE_INVALID');
  if (end && (!visaDateOnly(end) || end <= reportedOn || (item.stay_end && (!visaDateOnly(item.stay_end) || end <= item.stay_end))))
    throw new Error('VISA_EXTENSION_EXPIRY_INVALID');
  const key = createKey();
  if (typeof key !== 'string' || key.length < 8 || key.length > 255 || !key.trim()) throw new Error('VISA_EXTENSION_KEY_INVALID');
  return { signature, body: { kind, reported_on: reportedOn, reported_stay_end: end, expected_version: item.version!, idempotency_key: key } };
}
