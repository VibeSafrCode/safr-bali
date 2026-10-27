import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {renderVisaStayControls,type VisaStayControlsProps} from '../src/components/VisaStayControls';
import {clientVisaStayCopy} from '../src/i18n/client-visa-stay-copy';
import {createClientUiBindings,CLIENT_UI_LANGUAGE_OPTIONS} from '../src/i18n/client-ui-bindings';
import type {VisaCase} from '../src/api/types';

const item={id:7,version:2,lifecycle_status:'ACTIVE',entered_on:null,issued_on:'2026-10-01',stay_end:'2026-12-01',entry_deadline:null} as VisaCase;
function props():VisaStayControlsProps{return {item,primary:{label:'confirmed',value:'2026-12-01',estimated:false},dates:<dl><dt>confirmed</dt><dd>2026-12-01</dd></dl>,today:'2026-10-23',locale:'en',copy:clientVisaStayCopy(undefined,'en'),entryLabel:'Entry date',confirmLabel:'Confirm',pendingLabel:'Saving',entryDate:'',draft:{kind:'APPLIED',on:'',end:''},disabled:false,mutation:null,formatDate:v=>v,onEntryDate:()=>{},onDraft:()=>{},onEntry:()=>{},onExtension:()=>{},onRefresh:()=>{}};}
const html=(p:VisaStayControlsProps)=>renderToStaticMarkup(renderVisaStayControls(p));
for(const language of CLIENT_UI_LANGUAGE_OPTIONS)test('explicit new stay copy and controlled named ring: '+language.code,()=>{
 const p=props(),ui=createClientUiBindings(language.code);p.locale=language.code;p.copy=clientVisaStayCopy(ui,'en');
 for(const value of Object.values(p.copy))assert.ok(typeof value==='string'&&value.length>0);
 const s=html(p);assert.ok(s.includes('role="img"'));assert.ok(s.includes('data-stay-action="entry"'));assert.ok(s.includes('data-stay-action="extension"'));assert.ok(s.includes('name="reported_on"'));assert.equal(s.includes('class="visa-stay-arc"'),false); // no invented start
 assert.ok(s.includes(p.copy.heading));assert.equal(s.includes('name="stay_end"'),false);assert.equal(s.includes('name="lifecycle_status"'),false);
});
test('unknown/mismatched/terminal countdowns never invent a legal term or active arc',()=>{
 const p=props();p.item={...item,lifecycle_status:'EXPIRED',entered_on:'2026-10-01'};let s=html(p);
 assert.ok(s.includes(p.copy.unknown));assert.equal(s.includes('class="visa-stay-arc"'),false);assert.ok(s.includes('data-stay-action="extension"'));assert.equal(s.includes('data-stay-action="entry"'),false);
 p.primary=null;s=html(p);assert.ok(s.includes(p.copy.unknown));
 p.item={...item,lifecycle_status:'CANCELLED'};s=html(p);assert.equal(s.includes('role="img"'),false);assert.equal(s.includes('<form'),false);
});
test('unverified reported end is never the confirmed countdown or a legal input',()=>{
 const p=props();p.item={...item,stay_reports:{entry_provenance:null,extension:{kind:'RECEIVED',reported_on:'2026-10-20',reported_stay_end:'2027-12-01',provenance:'client_report',verified:false}}};
 const s=html(p);assert.ok(s.includes(p.copy.unverified));assert.ok(s.includes('2027-12-01'));assert.ok(s.includes('39 days'));assert.equal(s.includes('404 days'),false);
 p.item.stay_reports!.extension!.reported_on='2026-02-29';assert.equal(html(p).includes('class="visa-stay-client-report"'),false);
});

test('an entry-based provisional countdown has a visible arc and exact self-report provenance',()=>{
 const p=props();p.item={...item,entered_on:'2026-10-01',stay_end:null,stay_reports:{entry_provenance:'client_report',extension:null}};
 p.primary={label:'estimated',value:'2027-10-01',estimated:true,basis:'entry_estimate'};
 const s=html(p);assert.ok(s.includes('class="visa-stay-arc"'));assert.ok(s.includes('is-estimated'));
 assert.ok(s.includes('aria-label="Estimated.'));assert.equal(s.includes('<small>Estimated</small>'),false);
 assert.ok(s.includes('data-entry-provenance="client_report"'));assert.ok(s.includes(p.copy.unverified));
 assert.equal(s.includes('name="stay_end"'),false);
 p.primary={label:'legacy forecast',value:'2027-10-01',estimated:true};assert.equal(html(p).includes('class="visa-stay-arc"'),false);
});

test('the already-selected extension kind preserves the date; only an actual kind change clears it',()=>{
 const p=props();p.draft={kind:'RECEIVED',on:'2026-10-20',end:'2027-10-20'};
 const changes:typeof p.draft[]=[];p.onDraft=draft=>changes.push(draft);
 const walk=(v:any):any[]=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(walk):[v,...walk(v.props?.children)];
 const buttons=walk(renderVisaStayControls(p));
 buttons.find(v=>v.props?.['data-extension-kind']==='RECEIVED').props.onClick();assert.equal(changes.length,0);
 buttons.find(v=>v.props?.['data-extension-kind']==='APPLIED').props.onClick();assert.deepEqual(changes,[{kind:'APPLIED',on:'2026-10-20',end:''}]);
});

for(const language of CLIENT_UI_LANGUAGE_OPTIONS)test('staff confirmed entry is distinct from client report: '+language.code,()=>{
 const p=props();p.locale=language.code;p.copy=clientVisaStayCopy(createClientUiBindings(language.code),'en');
 p.item={...item,entered_on:'2026-10-23',stay_reports:{entry_provenance:'staff_confirmed',extension:null}};
 const s=html(p);assert.ok(s.includes('data-entry-provenance="staff_confirmed"'));assert.ok(s.includes(p.copy.staffConfirmed));
 assert.equal(s.includes(p.copy.unverified),false);assert.equal(s.includes('Synthetic stamp'),false);
});
