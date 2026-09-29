type Locale = "ru" | "en";
export type StatusKind = "service" | "lifecycle" | "external";
const labels: Record<StatusKind, Record<string, [string, string]>> = {
  service: {
    PURCHASED: ["Услуга оформлена", "Service registered"], DOCUMENTS_REQUIRED: ["Ждём документы", "Awaiting documents"],
    DOCUMENTS_RECEIVED: ["Документы получены", "Documents received"], SUBMITTED: ["Заявка подана", "Application submitted"],
    WAITING_PAYMENT: ["Ожидаем оплату", "Awaiting payment"], PAID: ["Оплачено", "Paid"], PROCESSING: ["В работе", "In progress"],
    ACTION_REQUIRED: ["Нужно действие", "Action needed"], COMPLETED: ["Услуга завершена", "Service completed"], CANCELLED: ["Отменено", "Cancelled"],
  },
  lifecycle: {
    NOT_ISSUED: ["Ещё не выдана", "Not issued yet"], ISSUED_NOT_ACTIVATED: ["Выдана, въезд не отмечен", "Issued, entry not recorded"],
    ACTIVE: ["Действует", "Active"], EXPIRING: ["Срок заканчивается", "Expiring"], EXTENSION_PROCESSING: ["Продление в работе", "Extension in progress"],
    EXTENDED: ["Продлена", "Extended"], EXPIRED: ["Срок истёк", "Expired"], CANCELLED: ["Отменена", "Cancelled"], REFUSED: ["Отказ", "Refused"],
  },
  external: {
    UNKNOWN: ["Этап не указан", "Stage not set"], WAITING_PAYMENT: ["Ожидается оплата внешнего процесса", "External payment pending"],
    PAID: ["Оплата внешнего процесса подтверждена", "External payment confirmed"], SUBMITTED: ["Документы поданы", "Documents submitted"],
    PROCESSING: ["На рассмотрении", "Under review"], ACTION_REQUIRED: ["Нужно действие", "Action needed"],
    BIOMETRICS_REQUIRED: ["Нужна биометрия", "Biometrics required"], APPROVED: ["Одобрено", "Approved"], REJECTED: ["Отклонено", "Rejected"], CANCELLED: ["Отменено", "Cancelled"],
  },
};

export function visaStatusLabel(kind: StatusKind, code: string, locale: Locale, processType?: string) {
  if (kind === "external" && code === "PROCESSING" && processType === "APPLICATION") {
    return locale === "ru" ? "Ожидаем выдачу" : "Awaiting issuance";
  }
  return labels[kind][code]?.[locale === "ru" ? 0 : 1] ?? code;
}

export const visaWasIssued = (status: string) => ["ISSUED_NOT_ACTIVATED", "ACTIVE", "EXPIRING", "EXTENSION_PROCESSING", "EXTENDED", "EXPIRED"].includes(status);
export const canToggleVisaIssued = (status: string) => ["NOT_ISSUED", "ISSUED_NOT_ACTIVATED"].includes(status);
export function toggleVisaIssued(status: string, checked: boolean) {
  if (!canToggleVisaIssued(status)) return status;
  return checked ? "ISSUED_NOT_ACTIVATED" : "NOT_ISSUED";
}

export type VisaDates = { entry_deadline?: string | null; stay_end?: string | null; date_source?: string | null };
const dateOnly = (value?: string | null) => value?.slice(0, 10) || "";
export function visaDatePatch(original: VisaDates, draft: VisaDates): VisaDates {
  const patch: VisaDates = {};
  for (const field of ["entry_deadline", "stay_end"] as const) {
    if (dateOnly(original[field]) !== dateOnly(draft[field])) patch[field] = dateOnly(draft[field]) || null;
  }
  // Unchanged fields are omitted: hiding a block never erases/reconfirms dates.
  const hasChangedDate = Object.values(patch).some(Boolean);
  if (hasChangedDate && !draft.date_source?.trim()) throw new Error("date_source_required");
  if (draft.date_source?.trim() && (hasChangedDate || draft.date_source !== original.date_source)) patch.date_source = draft.date_source;
  return patch;
}

export type VisaProcessDraft = { id?: number; process_type: string; external_status: string; reference?: string; action?: "UPSERT" | "REMOVE" };
export function mainVisaProcessIndex(processes: VisaProcessDraft[]) {
  // Backend returns newest ID first. Keep the same current process; never replace
  // an extension/approval with a newly synthesized APPLICATION merely due to PAID.
  return processes.findIndex(process => process.action !== "REMOVE");
}
export function setMainVisaProcess(processes: VisaProcessDraft[], status: string): VisaProcessDraft[] {
  const index = mainVisaProcessIndex(processes);
  if (index < 0) return status === "UNKNOWN" ? processes : [{process_type: "APPLICATION", external_status: status, action: "UPSERT"}, ...processes];
  return processes.map((process, at) => at === index ? {...process, external_status: status} : process);
}

export function isAwaitingVisaIssuance(service: string, lifecycle: string, process?: VisaProcessDraft) {
  return service === "PAID" && lifecycle === "NOT_ISSUED" && process?.process_type === "APPLICATION"
    && process.action !== "REMOVE" && ["SUBMITTED", "PROCESSING"].includes(process.external_status);
}

export function visaProcessChanges(original: Array<{id: number; type: string; external_status: string}>, draft: VisaProcessDraft[]) {
  return draft.filter(process => {
    const before = original.find(item => item.id === process.id);
    return !before || process.action === "REMOVE" || process.process_type !== before.type
      || process.external_status !== before.external_status || process.reference !== undefined;
  });
}

export function visaVisibilityPreferences(showToClient: boolean, notifyClient: boolean) {
  return {showToClient, notifyClient: showToClient && notifyClient};
}
export function canNotifyVisaChange(showToClient: boolean, notificationsEnabled?: boolean) {
  return showToClient && notificationsEnabled !== false;
}
export function keepVisaDateEditor(original: VisaDates, opened: boolean, draft: VisaDates) {
  return opened || Boolean(original.entry_deadline || original.stay_end || draft.entry_deadline || draft.stay_end);
}
