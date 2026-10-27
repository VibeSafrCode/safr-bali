import type { VisaCase, VisaStayEstimateSlot } from "../api/types";

export function stayDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

// Safe public projection only. No raw rule source, actor, event reference or
// client-side period arithmetic; the server calculates and binds the result.
export function savedVisaStayRule(slot: VisaStayEstimateSlot | undefined, purpose: "INITIAL" | "EXTENSION"): NonNullable<VisaStayEstimateSlot["rule"]> | null {
  const rule = slot?.rule;
  if (!slot || slot.purpose !== purpose || slot.estimated !== true || slot.provenance !== "administrator_provisional"
      || slot.confirmation_required !== true || (!["READY", "BASE_REQUIRED", "RECALC_REQUIRED"].includes(slot.state)
        && !(slot.state === "REVIEW_REQUIRED" && slot.review_reason === "TERMINAL_CASE"))
      || !rule || !/^provisional:[a-f0-9]{64}$/.test(rule.rule_id) || rule.version !== 1
      || !/^[A-Za-z0-9_.:-]{1,80}$/.test(rule.variant_id) || !["day", "month", "year"].includes(rule.unit)
      || !Number.isSafeInteger(rule.duration) || rule.duration < 1 || rule.duration > ({ day: 36500, month: 1200, year: 100 }[rule.unit])
      || !["base_included", "base_excluded"].includes(rule.counting_policy)
      || (purpose === "EXTENSION" && rule.counting_policy !== "base_excluded")
      || !["clamp", "reject"].includes(rule.month_end_policy)) return null;
  return rule;
}

export function readyVisaStayEstimate(slot: VisaStayEstimateSlot | undefined, purpose: "INITIAL" | "EXTENSION"): { base: string; end: string } | null {
  if (!slot || slot.purpose !== purpose || slot.state !== "READY" || slot.estimated !== true
      || slot.provenance !== "administrator_provisional" || slot.confirmation_required !== true
      || !savedVisaStayRule(slot, purpose) || !stayDate(slot.base) || !stayDate(slot.estimated_end) || slot.base > slot.estimated_end) return null;
  return { base: slot.base, end: slot.estimated_end };
}

export function initialVisaStayEstimate(item: Pick<VisaCase, "entered_on" | "stay_estimates"> & Partial<Pick<VisaCase, "lifecycle_status">>) {
  if (!["ISSUED_NOT_ACTIVATED", "ACTIVE", "EXPIRING", "EXTENSION_PROCESSING", "EXTENDED"].includes(item.lifecycle_status ?? "")) return null;
  const ready = readyVisaStayEstimate(item.stay_estimates?.initial, "INITIAL");
  return ready && ready.base === item.entered_on ? ready : null;
}
