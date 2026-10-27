import React, { type FormEvent, type ReactNode, type Ref } from 'react';
import type { VisaCase } from '../api/types';
import type { VisaStayCopy } from '../i18n/client-visa-stay-copy';
import { lifeProgress } from './lifeProgress';
import { canReportVisaEntry } from './visaEntryRequest';
import { canReportVisaExtension, visaDateOnly, type ExtensionKind } from './visaExtensionRequest';
import type { VisaDatePresentation } from './visaDatePresentation';

export type VisaExtensionDraft = { kind: ExtensionKind; on: string; end: string };
export type VisaStayControlsProps = {
  item: VisaCase; primary: VisaDatePresentation; dates: ReactNode; today: string; locale: string;
  copy: VisaStayCopy; entryLabel: string; confirmLabel: string; pendingLabel: string;
  entryDate: string; draft: VisaExtensionDraft; disabled: boolean; mutation: string | null;
  feedback?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  formatDate: (value: string) => string; onEntryDate: (value: string) => void;
  onDraft: (value: VisaExtensionDraft) => void; onEntry: (event: FormEvent) => void;
  onExtension: (event: FormEvent) => void; onRefresh: () => void;
};

// Controlled presentation factory: no hooks, requests, optimistic legal dates
// or mutable identity. Parent handlers enforce generation/actor/write fences.
export function renderVisaStayControls(p: VisaStayControlsProps) {
  const { item, copy: t, draft } = p;
  const terminal = ['CANCELLED', 'REFUSED'].includes(item.lifecycle_status);
  const end = p.primary?.value ?? null;
  const rawDays = end && visaDateOnly(end) && visaDateOnly(p.today)
    ? Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(p.today + 'T00:00:00Z')) / 86_400_000) : null;
  const mismatch = item.lifecycle_status === 'EXPIRED' && rawDays !== null && rawDays >= 0;
  const days = mismatch ? null : rawDays;
  const start = p.primary?.estimated && p.primary.basis !== 'entry_estimate' ? null : item.entered_on ?? (end === item.entry_deadline ? item.issued_on ?? null : null);
  const progress = terminal || mismatch ? null : lifeProgress(start, end, p.today);
  const label = days === null ? t.unknown : days < 0 ? t.overdue : days === 0 ? t.today : t.remaining;
  const dayText = days === null ? '—' : new Intl.NumberFormat(p.locale, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(Math.abs(days));
  const report = item.stay_reports?.extension;
  const validReport = report?.verified === false && report.provenance === 'client_report'
    && (report.kind === 'APPLIED' || report.kind === 'RECEIVED') && visaDateOnly(report.reported_on)
    && (report.reported_stay_end === null || visaDateOnly(report.reported_stay_end));
  return <section className="visa-stay-controls" data-visa-stay-controls="v1" aria-label={t.heading}>
    <h3 ref={p.headingRef} tabIndex={-1}>{t.heading}</h3>
    <div className="visa-stay-date-grid">{p.dates}
      {!terminal && <div className={`visa-stay-ring${p.primary?.estimated ? ' is-estimated' : ''}`} role="img" aria-label={`${p.primary?.estimated ? t.estimated + '. ' : ''}${label}: ${dayText}`}>
        <svg viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="40" className="visa-stay-track" />{progress && <circle cx="44" cy="44" r="40" className="visa-stay-arc" pathLength="100" transform="rotate(-90 44 44)" strokeDasharray={`${progress.fraction * 100} 100`} />}</svg>
        <span aria-hidden="true"><small>{label}</small><strong>{dayText}</strong></span>
      </div>}
    </div>
    {p.feedback}
    <p className="visa-stay-report-help">{t.reportHelp}</p>
    {item.stay_reports?.entry_provenance === 'client_report' && visaDateOnly(item.entered_on ?? '') && <div className="visa-stay-client-report" data-entry-provenance="client_report"><strong>{t.unverified}</strong><p>{p.entryLabel} · {p.formatDate(item.entered_on!)}</p></div>}
    {item.stay_reports?.entry_provenance === 'staff_confirmed' && visaDateOnly(item.entered_on ?? '') && <div className="visa-stay-client-report" data-entry-provenance="staff_confirmed"><strong>{t.staffConfirmed}</strong><p>{p.entryLabel} · {p.formatDate(item.entered_on!)}</p></div>}
    {canReportVisaEntry(item) && <form className="visa-stay-form" data-stay-action="entry" aria-busy={p.mutation === 'entry'} onSubmit={p.onEntry}>
      <h3>{t.entry}</h3><label>{p.entryLabel}<input name="entered_on" type="date" required min={item.issued_on ?? undefined} max={p.today} disabled={p.disabled} value={p.entryDate} onChange={event => p.onEntryDate(event.target.value)} /></label>
      <button className="button primary" disabled={p.disabled}>{p.mutation === 'entry' ? p.pendingLabel : t.entry}</button>
    </form>}
    {canReportVisaExtension(item) && <form className="visa-stay-form" data-stay-action="extension" aria-busy={p.mutation === 'extension'} onSubmit={p.onExtension}>
      <div className="visa-extension-kinds" role="group" aria-label={`${t.applied} / ${t.received}`}>
        <button className="button secondary" type="button" data-extension-kind="APPLIED" aria-pressed={draft.kind === 'APPLIED'} disabled={p.disabled} onClick={() => { if (draft.kind !== 'APPLIED') p.onDraft({ ...draft, kind: 'APPLIED', end: '' }); }}>{t.applied}</button>
        <button className="button secondary" type="button" data-extension-kind="RECEIVED" aria-pressed={draft.kind === 'RECEIVED'} disabled={p.disabled} onClick={() => { if (draft.kind !== 'RECEIVED') p.onDraft({ ...draft, kind: 'RECEIVED', end: '' }); }}>{t.received}</button>
      </div>
      <label>{t.reportedOn}<input name="reported_on" type="date" required min={item.issued_on ?? undefined} max={p.today} disabled={p.disabled} value={draft.on} onChange={event => p.onDraft({ ...draft, on: event.target.value })} /></label>
      {draft.kind === 'RECEIVED' && <label>{t.reportedEnd}<input name="reported_stay_end" type="date" disabled={p.disabled} value={draft.end} onChange={event => p.onDraft({ ...draft, end: event.target.value })} /></label>}
      <button className="button primary" type="submit" disabled={p.disabled}>{p.mutation === 'extension' ? p.pendingLabel : t.send}</button>
    </form>}
    {validReport && <div className="visa-stay-client-report"><strong>{t.unverified}</strong><p>{report.kind === 'APPLIED' ? t.applied : t.received} · {p.formatDate(report.reported_on)}{report.reported_stay_end && <> · {p.formatDate(report.reported_stay_end)}</>}</p></div>}
    {!canReportVisaEntry(item) && !canReportVisaExtension(item) && <p>{t.unavailable}</p>}
    <button className="button secondary" type="button" disabled={p.disabled} onClick={p.onRefresh}>{t.refresh}</button>
  </section>;
}
