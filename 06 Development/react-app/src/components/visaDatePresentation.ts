import type {VisaCase} from '../api/types';
export type VisaDatePresentation = {label: string; value: string; estimated: boolean} | null;

// Same canonical presentation, separated so Life need not load the visa editor.
export function visaDatePresentation(item: Pick<VisaCase, 'entered_on' | 'entry_deadline' | 'stay_end' | 'expected_stay_end'>, locale: 'ru' | 'en'): VisaDatePresentation {
  if (item.entered_on && item.stay_end) {
    return {label: locale === 'ru' ? 'Разрешено находиться до' : 'Permitted to stay until', value: item.stay_end, estimated: false};
  }
  if (!item.entered_on && item.entry_deadline) {
    return {label: locale === 'ru' ? 'Въехать до' : 'Enter by', value: item.entry_deadline, estimated: false};
  }
  if (item.expected_stay_end) {
    return {label: locale === 'ru' ? 'Предварительно — находиться до' : 'Estimated stay until', value: item.expected_stay_end, estimated: true};
  }
  return null;
}
