import type {VisaCase} from '../api/types';
import {initialVisaStayEstimate} from './visaStayEstimate';
export type VisaDatePresentation = {label: string; value: string; estimated: boolean; basis?: 'entry_estimate'} | null;

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
