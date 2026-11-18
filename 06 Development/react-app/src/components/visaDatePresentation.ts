import type {VisaCase} from '../api/types';
import {initialVisaStayEstimate} from './visaStayEstimate';
import {visaBaliToday, visaDateOnly} from './visaExtensionRequest';
export type VisaDatePresentation = {label: string; value: string; estimated: boolean; basis?: 'entry_estimate'} | null;

export function visaBaliDate(value: string | null | undefined): string | null {
  if (!value || !visaDateOnly(value.slice(0, 10))) return null;
  if (value.length === 10) return value;
  const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!timestamp) return null;
  // The backend treats legacy timestamps with no offset as UTC.
  const instant = new Date(timestamp[1] ? value : value + 'Z');
  return Number.isFinite(instant.getTime()) ? visaBaliToday(instant) : null;
}

export function visaCountdownStart(item: Pick<VisaCase, 'entered_on' | 'entry_deadline' | 'issued_on'>, date: VisaDatePresentation): string | null {
  if (!date || (date.estimated && date.basis !== 'entry_estimate')) return null;
  return item.entered_on ?? (date.value === item.entry_deadline ? item.issued_on ?? null : null);
}

// Same canonical presentation, separated so Life need not load the visa editor.
export function visaDatePresentation(item: Pick<VisaCase, 'entered_on' | 'entry_deadline' | 'stay_end' | 'expected_stay_end'> & Partial<Pick<VisaCase,'stay_estimates'|'lifecycle_status'>>, locale: 'ru' | 'en'): VisaDatePresentation {
  if (item.entered_on && item.stay_end) {
    return {label: locale === 'ru' ? 'Разрешено находиться до' : 'Permitted to stay until', value: item.stay_end, estimated: false};
  }
  if (!item.entered_on && item.entry_deadline) {
    return {label: locale === 'ru' ? 'Въехать до' : 'Enter by', value: item.entry_deadline, estimated: false};
  }
  // A confirmed expiry remains useful even if entry has not been recorded.
  // Displaying it neither invents an entry date nor activates the visa; a later
  // extension forecast must not hide this currently confirmed boundary.
  if (item.stay_end) {
    return {label: locale === 'ru' ? 'Разрешено находиться до' : 'Permitted to stay until', value: item.stay_end, estimated: false};
  }
  const initial = initialVisaStayEstimate(item);
  if (initial) {
    return {label: locale === 'ru' ? 'Предварительно — находиться до' : 'Estimated stay until', value: initial.end, estimated: true, basis: 'entry_estimate'};
  }
  if (item.expected_stay_end) {
    return {label: locale === 'ru' ? 'Предварительно — находиться до' : 'Estimated stay until', value: item.expected_stay_end, estimated: true};
  }
  return null;
}
