export type ReminderPolicy = {
  enabled: boolean;
  long_term_threshold_days: number;
  long_offsets: number[];
  short_offsets: number[];
  timezone: "Asia/Makassar";
  monthly_basis: "explicit_end_only";
};
export type ReminderDraft = { enabled: boolean; threshold: string; long: string; short: string };
export const DEFAULT_REMINDER_POLICY: ReminderPolicy = {
  enabled: false, long_term_threshold_days: 100,
  long_offsets: [40, 30, 15, 7, 3, 2, 1], short_offsets: [15, 7, 3, 2, 1],
  timezone: "Asia/Makassar", monthly_basis: "explicit_end_only",
};
export function reminderDraft(policy: ReminderPolicy): ReminderDraft {
  return { enabled: policy.enabled, threshold: String(policy.long_term_threshold_days), long: policy.long_offsets.join(", "), short: policy.short_offsets.join(", ") };
}
export function parseReminderDraft(draft: ReminderDraft, locale: "ru" | "en"): ReminderPolicy {
  const ru = locale === "ru";
  if (!/^\d+$/.test(draft.threshold.trim()) || Number(draft.threshold) < 1 || Number(draft.threshold) > 3660) {
    throw new Error(ru ? "Порог длительной услуги: введите целое число от 1 до 3660." : "Long-service threshold: enter a whole number from 1 to 3660.");
  }
  function offsets(raw: string, label: string): number[] {
    const parts = raw.trim().split(/[,;\s]+/);
    if (parts.some((part) => !/^\d+$/.test(part) || Number(part) < 1 || Number(part) > 3660)) {
      throw new Error(ru ? `${label}: укажите целые дни от 1 до 3660, разделённые запятыми.` : `${label}: use whole days from 1 to 3660, separated by commas.`);
    }
    const result = [...new Set(parts.map(Number))].sort((a, b) => b - a);
    if (result.length > 12) throw new Error(ru ? `${label}: не больше 12 напоминаний.` : `${label}: at most 12 reminders.`);
    return result;
  }
  return { enabled: draft.enabled, long_term_threshold_days: Number(draft.threshold), long_offsets: offsets(draft.long, ru ? "Длительные услуги" : "Long services"), short_offsets: offsets(draft.short, ru ? "Короткие услуги" : "Short services"), timezone: "Asia/Makassar", monthly_basis: "explicit_end_only" };
}
export function reminderDate(end: string, offset: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const stamp = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== end) return null;
  return new Date(stamp - offset * 86_400_000).toISOString().slice(0, 10);
}
