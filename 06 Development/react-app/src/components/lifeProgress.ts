const DAY = 86_400_000;
function stamp(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const n = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null;
}
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);

// Calendar months are anchored to the original rental day (Jan 31 → Feb 28 → Mar 31).
// The ring describes time, never whether a payment or renewal has occurred.
export function lifeProgress(startDate: string | null, endDate: string | null, today: string, monthly = false) {
  const start = stamp(startDate), end = stamp(endDate), now = stamp(today);
  if (start === null || now === null || now < start || (endDate !== null && end === null) || (end !== null && end <= start)) return null;
  let from = start, to = end;
  const repeating = monthly && (end === null || now < end);
  if (repeating) {
    const anchor = new Date(start), current = new Date(now);
    const anniversary = (offset: number) => {
      const year = anchor.getUTCFullYear(), month = anchor.getUTCMonth() + offset;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay));
    };
    let months = (current.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + current.getUTCMonth() - anchor.getUTCMonth();
    if (anniversary(months) > now) months--;
    from = anniversary(months);
    to = anniversary(months + 1);
    if (end !== null) to = Math.min(to, end);
  }
  if (to === null || to <= from) return null;
  const total = Math.round((to - from) / DAY);
  const elapsed = Math.min(total, Math.max(0, Math.round((now - from) / DAY)));
  return { total, elapsed, remaining: total - elapsed, fraction: repeating ? elapsed / total : (total - elapsed) / total, repeating, end: iso(to) };
}
