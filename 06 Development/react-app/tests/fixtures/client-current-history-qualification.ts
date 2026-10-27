import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {restoreAcceptedSourceHistory,sourceHistoryRows} from './client-source-history';
import {restoreChildTestBeforeYogaImports} from './client-child-test-history';

type Hunk=Readonly<{current:string;accepted:string}>;
type Qualification=Readonly<{id:string;file:string;currentSha256:string;acceptedSha256:string;
 historyIds:readonly string[];hunks:readonly Hunk[]}>;
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');

// Test-only finite source views for separately reviewed later additions. These
// are not new historical donors, runtime patches, auth/behavior/native proof,
// regex normalization, a current-source fallback, or permission to re-pin the
// unchanged original source-history/child-history helpers and JSON.
const specifications=[
  {
    "id": "reviewed-visa-stay-types",
    "file": "src/api/types.ts",
    "currentSha256": "eaa462d106c29bbe0e0f406ed7686d901bb760b43baf42eb4b908812751f7f7e",
    "acceptedSha256": "addd837df269518353b1f3f07dd32504378710d81eb43db2b353c9328e142507",
    "historyIds": [
      "legacyTypes"
    ],
    "hunks": [
      {
        "current": "export type VisaStayEstimateSlot = {\n  purpose: \"INITIAL\" | \"EXTENSION\";\n  state: \"NOT_SELECTED\" | \"CLEARED\" | \"BASE_REQUIRED\" | \"READY\" | \"RECALC_REQUIRED\" | \"INVALID_SNAPSHOT\" | \"REVIEW_REQUIRED\";\n  estimated: true; base: string | null; estimated_end: string | null;\n  review_reason?: \"TERMINAL_CASE\" | \"TYPE_CHANGED\" | \"ENTRY_CALCULATION_INVALID\";\n  base_provenance?: \"client_report\"; calculated_from_entry_report?: boolean;\n  provenance?: \"administrator_provisional\"; confirmation_required?: boolean;\n  rule?: { rule_id: string; version: number; variant_id: string; unit: \"day\" | \"month\" | \"year\";\n    duration: number; counting_policy: \"base_included\" | \"base_excluded\"; month_end_policy: \"clamp\" | \"reject\" } | null;\n};\n\n",
        "accepted": ""
      },
      {
        "current": "  // Legacy cached read-only cards may omit this; every mutation requires it.\n  version?: number;\n",
        "accepted": ""
      },
      {
        "current": "  visa_type: { id?: number; code: string; name: string; version: number };\n",
        "accepted": "  visa_type: { code: string; name: string; version: number };\n"
      },
      {
        "current": "  stay_estimates?: { initial: VisaStayEstimateSlot; extension: VisaStayEstimateSlot };\n  stay_reports?: {\n    entry_provenance: \"client_report\" | \"staff_confirmed\" | \"legacy_unknown\" | null;\n    extension: { kind: \"APPLIED\" | \"RECEIVED\"; reported_on: string; reported_stay_end: string | null; provenance: \"client_report\"; verified: false } | null;\n  };\n",
        "accepted": ""
      }
    ]
  },
  {
    "id": "reviewed-visa-stay-css",
    "file": "src/styles.css",
    "currentSha256": "c68a39904457ec9f4155f6c9512c7f3777f406a76953136c595966a4fbeec069",
    "acceptedSha256": "cff7490bfe14aaa92f8804a07b648231de5d0021f537ef5d89a3c57ce9c61569",
    "historyIds": [
      "calculatorCss"
    ],
    "hunks": [
      {
        "current": ".visa-stay-controls { min-width: 0; display: grid; gap: 14px; margin-block-start: 16px; }\n.visa-stay-date-grid { display: grid; grid-template-columns: minmax(0, 1fr) 96px; align-items: center; gap: 12px; }\n.visa-stay-date-grid .visa-dates { min-width: 0; grid-template-columns: minmax(0, 1fr); }\n.visa-stay-controls :is(h3, dt, dd) { overflow-wrap: anywhere; }\n.visa-stay-date-grid .visa-dates div { border-inline-end: 0; padding-inline-end: 0; }\n.visa-stay-ring { position: relative; width: 96px; height: 96px; display: grid; place-items: center; color: var(--safr-text-primary); }\n.visa-stay-ring svg { position: absolute; inset: 0; width: 100%; height: 100%; fill: none; stroke-width: 2; }\n.visa-stay-track { stroke: currentColor; opacity: .3; stroke-dasharray: 2 4; }\n.visa-stay-arc { stroke: var(--safr-color-forest); stroke-width: 4; }\n.visa-stay-ring > span { width: 75px; display: grid; gap: 2px; text-align: center; overflow-wrap: anywhere; }\n.visa-stay-ring small { font-size: .65rem; line-height: 1.15; }\n.visa-stay-ring strong { font-size: .95rem; line-height: 1.15; }\n.visa-stay-ring.is-estimated { border-radius: 50%; outline: 1px dashed currentColor; }\n.visa-stay-form { min-width: 0; display: flex; flex-wrap: wrap; align-items: end; gap: 10px; padding-block: 12px; border-block-start: 1px solid var(--safr-border-subtle); }\n.visa-stay-form h3 { flex-basis: 100%; margin: 0; }\n.visa-extension-kinds { display: flex; flex-wrap: wrap; gap: 8px; flex-basis: 100%; min-width: 0; }\n.visa-extension-kinds [aria-pressed=\"true\"] { text-decoration: underline; text-underline-offset: 4px; border-color: currentColor; }\n.visa-stay-form label { min-width: 0; flex: 1 1 190px; display: grid; gap: 6px; overflow-wrap: anywhere; }\n.visa-stay-form :is(input, select) { box-sizing: border-box; min-width: 0; max-width: 100%; width: 100%; min-height: 44px; font: inherit; }\n.visa-stay-form .button, .visa-stay-controls > .button { min-height: 44px; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }\n.visa-stay-controls :is(button, input, select):focus-visible { outline: 3px solid var(--safr-color-coral); outline-offset: 2px; }\n.visa-stay-report-help, .visa-stay-client-report p { margin: 0; overflow-wrap: anywhere; }\n.visa-stay-client-report { padding: 12px; border: 1px dashed var(--safr-border-subtle); border-radius: 12px; }\n@media(max-width: 380px) { .visa-stay-date-grid { grid-template-columns: minmax(0, 1fr) 88px; gap: 8px; } .visa-stay-ring { width: 88px; height: 88px; } .visa-stay-form .button { flex-basis: 100%; } }\n",
        "accepted": ""
      }
    ]
  },
  {
    "id": "reviewed-mini-section-fallback",
    "file": "src/surfaces/MiniApp.tsx",
    "currentSha256": "cd3ba27caff46eeb002dcde053abc6826242063201712b883e547895953cb6cc",
    "acceptedSha256": "2e59fceae97c0ba115e84b32b79b8ac304242ebef9cc94f1922bb6702b62c695",
    "historyIds": [
      "legacyMini",
      "parentMini",
      "visaActivationMini"
    ],
    "hunks": [
      {
        "current": "      <SectionBoundary key={segments.join('/')} locale={locale} errorFallback={ui ? <section className=\"panel\" role=\"alert\" lang={ui.locale} dir={ui.dir}>\n        <h2>{t('mini.error.title')}</h2>\n        <button className=\"button secondary\" type=\"button\" onClick={() => window.location.reload()}>{t('mini.action.retry')}</button>\n      </section> : undefined}>",
        "accepted": "      <SectionBoundary key={segments.join('/')} locale={locale}>"
      }
    ]
  },
  {
    "id": "reviewed-child-support-focus",
    "file": "tests/client-account-children-ten-locale.test.tsx",
    "currentSha256": "049d2dba2fa6ae5fe1583aa6117b899a06978a6198941e00a9d7f887d9d816f7",
    "acceptedSha256": "515ba041813e34e79d69b8d909dd56d06e4301f2ec89312000fc65008646e134",
    "historyIds": [],
    "hunks": [
      {
        "current": "  for(const activeTab of [\"home\",\"services\",\"life\",\"profile\",\"support\"]){\n    const props={...nav,activeTab},current=render(\"BottomNavigation\",props,contact);\n    // The sole intended markup delta is a non-copy focus-return target.\n    assert.equal(current.match(/ data-support-trigger=\"true\"/g)?.length,1);\n    assert.equal(current.replace(' data-support-trigger=\"true\"',''),render(\"BottomNavigation\",props,contact,true));\n  }",
        "accepted": "  for(const activeTab of [\"home\",\"services\",\"life\",\"profile\",\"support\"]){const props={...nav,activeTab};assert.equal(render(\"BottomNavigation\",props,contact),render(\"BottomNavigation\",props,contact,true));}"
      }
    ]
  }
] as const;
export const reviewedCurrentHistoryQualifications:readonly Qualification[]=Object.freeze(
 specifications.map(row=>Object.freeze({...row,historyIds:Object.freeze([...row.historyIds]),
  hunks:Object.freeze(row.hunks.map(hunk=>Object.freeze({...hunk})))})));
assert.equal(reviewedCurrentHistoryQualifications.length,4);
assert.equal(new Set(reviewedCurrentHistoryQualifications.map(row=>row.id)).size,4);
const historicalIds=reviewedCurrentHistoryQualifications.flatMap(row=>row.historyIds);
assert.equal(new Set(historicalIds).size,historicalIds.length);

export function normalizeReviewedCurrentHistorySource(ruleId:string,source:string):string{
 assert.equal(typeof ruleId,'string','Primitive qualification identity required');
 assert.equal(typeof source,'string','Primitive source text required');
 const rule=reviewedCurrentHistoryQualifications.find(row=>row.id===ruleId);
 assert.ok(rule,'Known finite reviewed source qualification');
 assert.equal(sha(source),rule.currentSha256,'Exact whole reviewed current source before qualification');
 for(const hunk of rule.hunks){
  assert.ok(hunk.current.length>0,'Nonempty literal reviewed span');
  assert.equal(source.split(hunk.current).length,2,'Exactly one complete reviewed source span');
  source=source.replace(hunk.current,hunk.accepted);
 }
 assert.equal(sha(source),rule.acceptedSha256,'Entire earlier accepted source after literal qualification');
 return source;
}

export function restoreCurrentAcceptedSourceHistory(id:string,source:string):string{
 assert.equal(typeof id,'string','Primitive history identity required');
 assert.equal(typeof source,'string','Primitive source text required');
 const row=sourceHistoryRows.find(row=>row.id===id);
 assert.ok(row,'Known original source-history identity');
 const rule=reviewedCurrentHistoryQualifications.find(item=>item.historyIds.includes(id));
 if(rule){
  assert.equal(row.file,rule.file,'Qualified identity retains original file binding');
  assert.equal(row.acceptedSha256,rule.acceptedSha256,'Qualified identity retains original accepted pin');
  source=normalizeReviewedCurrentHistorySource(rule.id,source);
 }
 return restoreAcceptedSourceHistory(id,source);
}

export function restoreCurrentChildTestBeforeYogaImports(source:string):string{
 return restoreChildTestBeforeYogaImports(normalizeReviewedCurrentHistorySource('reviewed-child-support-focus',source));
}
