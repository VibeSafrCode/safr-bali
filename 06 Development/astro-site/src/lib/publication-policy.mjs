/**
 * Pure public-indexing decision. Callers provide the actual localized content
 * version and an explicit evaluation time; this module never invents evidence.
 * Availability is intentionally not an indexing criterion: an upcoming service
 * may still have a useful, reviewed article, while an available stub may not.
 */

/** Parse a real ISO calendar date or a UTC ISO timestamp, without Date rollover. */
function strictDate(value, endOfDay = false) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z)?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction] = match;
  const canonical = `${year}-${month}-${day}T${hour ?? "00"}:${minute ?? "00"}:${second ?? "00"}.${(fraction ?? "0").padEnd(3, "0")}Z`;
  const timestamp = Date.parse(canonical);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== canonical) return null;
  return timestamp + (endOfDay && hour === undefined ? 86_399_999 : 0);
}

function safeSource(source) {
  if (!source || typeof source.url !== "string" || source.url.trim() !== source.url) return false;
  if (/\s|[\u0000-\u001f\u007f]/u.test(source.url)) return false;
  try {
    const url = new URL(source.url);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   publicationStatus: "published" | "draft" | "hidden" | "archived",
 *   reviewStatus: "not_required" | "legacy_needs_sources" | "needs_review" | "verified",
 *   requiresSources: boolean,
 *   hasSubstantialContent: boolean,
 *   locale: "ru" | "en",
 *   availableLocales: string[],
 *   reviewedAt?: string,
 *   reviewExpiresAt?: string,
 *   lastModified?: string,
 *   contentVersion?: string,
 *   reviewedVersion?: string,
 *   sources?: Array<{url: string}>
 * }} input
 * @param {{asOf: string | Date}} options Explicit clock, never the build's implicit current time.
 * @returns {{indexable: boolean, reason: string, lastmod?: string}}
 *
 * Review expiry is inclusive. A date-only expiry covers that entire UTC day;
 * a timestamp expires at that exact instant. Invalid/future lastModified is
 * omitted, not repaired, and does not invalidate otherwise sound review proof.
 */
export function evaluatePublication(input, { asOf } = {}) {
  const now = asOf instanceof Date ? asOf.getTime() : strictDate(asOf);
  if (now === null || !Number.isFinite(now)) return { indexable: false, reason: "invalid_evaluation_date" };

  const modified = strictDate(input?.lastModified);
  const metadata = modified !== null && modified <= now ? { lastmod: input.lastModified } : {};
  const deny = (reason) => ({ indexable: false, reason, ...metadata });
  if (!input || input.publicationStatus !== "published") return deny("not_published");
  if (input.hasSubstantialContent !== true) return deny("insufficient_content");
  if (!["ru", "en"].includes(input.locale) || !Array.isArray(input.availableLocales) || !input.availableLocales.includes(input.locale)) {
    return deny("locale_unavailable");
  }
  if (typeof input.requiresSources !== "boolean") return deny("invalid_review_policy");

  if (input.requiresSources || input.reviewStatus !== "not_required") {
    if (input.reviewStatus !== "verified") return deny("review_required");
    if (!Array.isArray(input.sources) || input.sources.length === 0 || !input.sources.every(safeSource)) return deny("invalid_sources");
    const reviewed = strictDate(input.reviewedAt);
    const expires = strictDate(input.reviewExpiresAt, true);
    if (reviewed === null || expires === null || expires < reviewed) return deny("invalid_review_dates");
    if (reviewed > now) return deny("review_in_future");
    if (now > expires) return deny("review_expired");
    if (typeof input.contentVersion !== "string" || !input.contentVersion.trim() || input.contentVersion !== input.reviewedVersion) {
      return deny("content_changed_since_review");
    }
  }

  return { indexable: true, reason: "eligible", ...metadata };
}
