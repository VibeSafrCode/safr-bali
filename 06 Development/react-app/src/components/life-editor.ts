import type { LifeDraft } from "./lifeServices";

// Only an explicit mode change replaces term metadata; reselecting is a no-op.
export function changeRentalMode(draft: LifeDraft, mode: "fixed" | "monthly"): LifeDraft {
  if ((draft.rental_mode ?? "fixed") === mode) return draft;
  return { ...draft, rental_mode: mode, end_date: mode === "monthly" ? "" : draft.end_date, price_unit: mode === "monthly" ? "month" : "period" };
}
