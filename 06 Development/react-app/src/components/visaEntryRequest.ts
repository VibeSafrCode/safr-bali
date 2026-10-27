import type { VisaCase } from "../api/types";

export type PendingVisaEntry = {
  signature: string;
  body: { entered_on: string; expected_version: number; idempotency_key: string };
};

export function canReportVisaEntry(item: Pick<VisaCase, "entered_on" | "version" | "lifecycle_status">): boolean {
  return !item.entered_on && Number.isSafeInteger(item.version) && (item.version ?? 0) > 0
    && ["ISSUED_NOT_ACTIVATED", "ACTIVE", "EXPIRING", "EXTENSION_PROCESSING", "EXTENDED"].includes(item.lifecycle_status);
}

// Keep one key/body through a rejected or unknown-outcome network attempt.
// Changing the actual case/version/date is a different explicit operation.
export function prepareVisaEntryRequest(previous: PendingVisaEntry | null, caseId: number,
  version: number | undefined, enteredOn: string, createKey: () => string): PendingVisaEntry {
  if (!Number.isSafeInteger(caseId) || caseId < 1 || !Number.isSafeInteger(version) || (version ?? 0) < 1)
    throw new Error("VISA_ENTRY_VERSION_REQUIRED");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(enteredOn)) throw new Error("VISA_ENTRY_DATE_INVALID");
  const parsed = new Date(enteredOn + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== enteredOn)
    throw new Error("VISA_ENTRY_DATE_INVALID");
  const signature = JSON.stringify([caseId, version, enteredOn]);
  if (previous?.signature === signature) return previous;
  const key = createKey();
  if (typeof key !== "string" || key.length < 8 || key.length > 255 || !key.trim())
    throw new Error("VISA_ENTRY_KEY_INVALID");
  return { signature, body: { entered_on: enteredOn, expected_version: version!, idempotency_key: key } };
}
