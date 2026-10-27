import { stayDate } from "./visaStayEstimate";

export type StaffStayCase = {
  id: number; version: number; lifecycle_status: string; publication_status: string;
  entered_on?: string | null; issued_on?: string | null; entry_deadline?: string | null;
  stay_end?: string | null; expected_stay_end?: string | null;
  extensions_used?: number;
  processes?: Array<{ id: number; type: string; external_status: string }>;
};
export type StaffStayDraft = {
  caseId: number | null; version: number | null;
  kind: "NONE" | "CONFIRM_ENTRY" | "CONFIRM_EXTENSION";
  enteredOn: string; documentEnd: string; processId: string;
  source: string; reason: string; clearExpected: boolean; acknowledged: boolean;
};
export type StaffStayAction = { kind: "CONFIRM_ENTRY"; entered_on: string; source_reference: string } | {
  kind: "CONFIRM_EXTENSION"; process_id: number; document_stay_end: string;
  source_reference: string; clear_expected_stay_end: boolean;
};
export function newStaffStayDraft(item: StaffStayCase | null, kind: StaffStayDraft["kind"] = "NONE"): StaffStayDraft {
  const extensions = item?.processes?.filter(p => p.type === "EXTENSION") ?? [];
  return { caseId: item?.id ?? null, version: item?.version ?? null, kind,
    enteredOn: item?.entered_on ?? "", documentEnd: "", processId: extensions.length === 1 ? String(extensions[0].id) : "",
    source: "", reason: "", clearExpected: false, acknowledged: false };
}
export function staffStayAvailable(item: StaffStayCase): boolean {
  return item.publication_status !== "ARCHIVED"
    && ["ISSUED_NOT_ACTIVATED", "ACTIVE", "EXPIRING", "EXTENSION_PROCESSING", "EXTENDED"].includes(item.lifecycle_status);
}
export function staffStayBindingMatches(draft: StaffStayDraft, item: StaffStayCase): boolean {
  return draft.caseId === item.id && draft.version === item.version;
}
export function reviewStaffStayDraft(draft: StaffStayDraft, item: StaffStayCase): StaffStayDraft {
  if (draft.caseId !== item.id) throw Error("STAFF_ACTION_CASE_CHANGED");
  return { ...draft, version: item.version, acknowledged: false };
}
export function prepareStaffStayAction(draft: StaffStayDraft, item: StaffStayCase, today: string): StaffStayAction | undefined {
  if (draft.kind === "NONE") return undefined;
  if (!staffStayBindingMatches(draft, item) || !staffStayAvailable(item)
      || !stayDate(today) || draft.source.trim().length < 3 || draft.source.trim().length > 2000
      || draft.reason.trim().length < 3 || draft.reason.trim().length > 2000 || draft.acknowledged !== true) throw Error("STAFF_ACTION_REVIEW_REQUIRED");
  if (draft.kind === "CONFIRM_ENTRY") {
    const entered = draft.enteredOn;
    if (!stayDate(entered) || entered > today || (item.issued_on && entered < item.issued_on)
        || (item.entry_deadline && entered > item.entry_deadline)
        || (item.entered_on && item.entered_on !== entered)
        || (item.stay_end && (entered > item.stay_end || today > item.stay_end))) throw Error("STAFF_ENTRY_DATE_REVIEW_REQUIRED");
    return { kind: draft.kind, entered_on: entered, source_reference: draft.source.trim() };
  }
  const process = item.processes?.find(p => p.type === "EXTENSION" && String(p.id) === draft.processId);
  if (draft.kind !== "CONFIRM_EXTENSION" || item.lifecycle_status === "ISSUED_NOT_ACTIVATED"
      || !process || !Number.isSafeInteger(process.id) || process.id < 1 || !stayDate(item.stay_end)
      || ["CANCELLED", "REJECTED", "REFUSED", "EXPIRED", "INVALID"].includes(process.external_status)
      || !Number.isSafeInteger(item.extensions_used) || item.extensions_used! < 0
      || !stayDate(draft.documentEnd) || draft.documentEnd <= item.stay_end || draft.documentEnd < today
      || (item.expected_stay_end && item.expected_stay_end <= draft.documentEnd && !draft.clearExpected)) throw Error("STAFF_EXTENSION_REVIEW_REQUIRED");
  return { kind: draft.kind, process_id: process.id, document_stay_end: draft.documentEnd,
    source_reference: draft.source.trim(), clear_expected_stay_end: draft.clearExpected };
}
export function assertStaffStayCompatibility(action: StaffStayAction | undefined,
  selection: { action: string; purpose: string } | undefined, processes: Array<{ id?: number }>): void {
  if (!action) return;
  if (action.kind === "CONFIRM_ENTRY") {
    if (selection && (selection.action !== "SELECT" || selection.purpose !== "INITIAL")) throw Error("ENTRY_PERIOD_CONFLICT");
  } else if ((selection && selection.action === "SELECT") || processes.some(p => p.id === action.process_id)) {
    throw Error("EXTENSION_PERIOD_OR_PROCESS_CONFLICT");
  }
}
