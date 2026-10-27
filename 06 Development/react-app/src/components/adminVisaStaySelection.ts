import type { VisaStayEstimateSlot } from "../api/types";
import { stayDate } from "./visaStayEstimate";
export { stayDate, savedVisaStayRule as savedAdminStayRule, readyVisaStayEstimate as readyAdminStayEstimate } from "./visaStayEstimate";

export type StayPurpose = "INITIAL" | "EXTENSION";
export type StaySelectionCase = {
  id: number; version: number; lifecycle_status: string; country_code?: string;
  visa_type: { id?: number; version?: number; code: string };
  entered_on?: string | null; stay_end?: string | null;
  stay_estimates?: { initial: VisaStayEstimateSlot; extension: VisaStayEstimateSlot };
};
type Binding = { caseId: number; version: number; countryCode?: string; typeCode: string; typeId?: number; typeVersion?: number };
export type AdminStaySelectionDraft = {
  binding: Binding | null; purpose: StayPurpose; action: "KEEP" | "SELECT" | "CLEAR";
  duration: string; unit: "day" | "month" | "year";
  counting: "" | "base_included" | "base_excluded"; monthEnd: "" | "clamp" | "reject";
  effectiveFrom: string; effectiveUntil: string; acknowledged: boolean;
};
export type AdminStaySelection = { action: "CLEAR"; purpose: StayPurpose } | {
  action: "SELECT"; purpose: StayPurpose; visa_type_id: number; visa_type_version: number;
  variant_id: string; unit: "day" | "month" | "year"; duration: number;
  counting_policy: "base_included" | "base_excluded"; month_end_policy: "clamp" | "reject";
  effective_from: string; effective_until: string | null;
};

const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const binding = (item: StaySelectionCase): Binding => ({ caseId: item.id, version: item.version, countryCode: item.country_code,
  typeCode: item.visa_type.code, typeId: item.visa_type.id, typeVersion: item.visa_type.version });
export function staySelectionBindingMatches(draft: AdminStaySelectionDraft, item: StaySelectionCase): boolean {
  const expected = binding(item);
  return draft.binding !== null && Object.entries(expected).every(([key, value]) => draft.binding![key as keyof Binding] === value);
}
export function newAdminStaySelection(item: StaySelectionCase | null, purpose: StayPurpose = "INITIAL"): AdminStaySelectionDraft {
  const base = item ? (purpose === "INITIAL" ? item.entered_on : item.stay_end) : null;
  return { binding: item ? binding(item) : null, purpose, action: "KEEP", duration: "", unit: "day",
    counting: "", monthEnd: "", effectiveFrom: stayDate(base) ? base : "", effectiveUntil: "", acknowledged: false };
}

// Closed convenience table for the existing Indonesian catalog identities.
// These are explicit administrator drafts, never verified legal rules/expiry.
// INITIAL is the stay per entry, not the validity of a multiple-entry visa.
// No display-name, prefix, legacy-day or FAMILY inference is permitted.
const periodPresets = [
  { code: "E33G", purpose: "INITIAL", days: 365 }, // Founder's explicit day preset, not one calendar year.
  { code: "D12", purpose: "INITIAL", days: 180 },
  { code: "D1/D2", purpose: "INITIAL", days: 60 },
  { code: "C1", purpose: "INITIAL", days: 60 },
  { code: "VOA", purpose: "INITIAL", days: 30 },
  { code: "D12", purpose: "EXTENSION", days: 180 },
  { code: "D1/D2", purpose: "EXTENSION", days: 60 },
  { code: "C1", purpose: "EXTENSION", days: 60 },
  { code: "VOA", purpose: "EXTENSION", days: 30 },
] as const;

export function adminStayPeriodPreset(item: StaySelectionCase, purpose: StayPurpose) {
  if (item.country_code !== "ID" || !positive(item.id) || !positive(item.version)
      || !positive(item.visa_type.id) || !positive(item.visa_type.version)
      || ["EXPIRED", "CANCELLED", "REFUSED"].includes(item.lifecycle_status)) return null;
  const slot = item.stay_estimates?.[purpose === "INITIAL" ? "initial" : "extension"];
  if (slot?.state === "INVALID_SNAPSHOT" || slot?.state === "REVIEW_REQUIRED") return null;
  return periodPresets.find(row => row.code === item.visa_type.code && row.purpose === purpose) ?? null;
}

export function presetAdminStaySelection(item: StaySelectionCase, purpose: StayPurpose): AdminStaySelectionDraft | null {
  const preset = adminStayPeriodPreset(item, purpose);
  if (!preset) return null;
  return { ...newAdminStaySelection(item, purpose), action: "SELECT", duration: String(preset.days), unit: "day",
    // Initial-day inclusivity is deliberately not guessed from a generic day count.
    counting: purpose === "EXTENSION" || preset.code === "E33G" ? "base_excluded" : "",
    monthEnd: "clamp", acknowledged: false };
}

export function e33g365Selection(item: StaySelectionCase, purpose: StayPurpose): AdminStaySelectionDraft | null {
  return item.visa_type.code === "E33G" && purpose === "INITIAL" ? presetAdminStaySelection(item, purpose) : null;
}

export function prepareAdminStaySelection(draft: AdminStaySelectionDraft, item: StaySelectionCase): AdminStaySelection | undefined {
  if (draft.action === "KEEP") return undefined;
  if (!staySelectionBindingMatches(draft, item) || !positive(item.id) || !positive(item.version)
      || !positive(item.visa_type.id) || !positive(item.visa_type.version)) throw Error("CONTEXT_REQUIRED");
  if (!["INITIAL", "EXTENSION"].includes(draft.purpose)) throw Error("PURPOSE_REQUIRED");
  const saved = item.stay_estimates?.[draft.purpose === "INITIAL" ? "initial" : "extension"];
  if (saved?.state === "INVALID_SNAPSHOT" || (saved?.state === "REVIEW_REQUIRED" && saved.review_reason !== "TERMINAL_CASE")) throw Error("SAVED_REVIEW_REQUIRED");
  if (draft.action === "CLEAR") return { action: "CLEAR", purpose: draft.purpose };
  if (draft.action !== "SELECT" || ["EXPIRED", "CANCELLED", "REFUSED"].includes(item.lifecycle_status)) throw Error("CASE_REVIEW_REQUIRED");
  const limits = { day: 36500, month: 1200, year: 100 };
  if (!Object.hasOwn(limits, draft.unit) || !/^[1-9]\d*$/.test(draft.duration)
      || !positive(Number(draft.duration)) || Number(draft.duration) > limits[draft.unit]) throw Error("PERIOD_REQUIRED");
  if (!["base_included", "base_excluded"].includes(draft.counting)
      || (draft.purpose === "EXTENSION" && draft.counting !== "base_excluded")) throw Error("COUNTING_REQUIRED");
  const monthEnd = draft.unit === "day" ? "clamp" : draft.monthEnd;
  if (monthEnd !== "clamp" && monthEnd !== "reject") throw Error("MONTH_END_REQUIRED");
  if (!stayDate(draft.effectiveFrom) || (draft.effectiveUntil && !stayDate(draft.effectiveUntil))
      || (draft.effectiveUntil && draft.effectiveUntil < draft.effectiveFrom)) throw Error("INTERVAL_REQUIRED");
  const base = draft.purpose === "INITIAL" ? item.entered_on : item.stay_end;
  if (base != null && (!stayDate(base) || base < draft.effectiveFrom || (draft.effectiveUntil && base > draft.effectiveUntil))) throw Error("BASE_REVIEW_REQUIRED");
  if (draft.acknowledged !== true) throw Error("ACKNOWLEDGEMENT_REQUIRED");
  return { action: "SELECT", purpose: draft.purpose, visa_type_id: item.visa_type.id, visa_type_version: item.visa_type.version,
    variant_id: `manual-${draft.purpose.toLowerCase()}-${draft.unit}-${Number(draft.duration)}`,
    unit: draft.unit, duration: Number(draft.duration), counting_policy: draft.counting as "base_included" | "base_excluded",
    month_end_policy: monthEnd, effective_from: draft.effectiveFrom, effective_until: draft.effectiveUntil || null };
}
