import test from 'node:test';
import assert from 'node:assert/strict';
import {canReportVisaExtension,prepareVisaExtensionRequest,visaBaliToday,visaDateOnly} from '../src/components/visaExtensionRequest';

const item={id:7,version:3,issued_on:'2026-01-01',stay_end:'2026-12-31'};
test('extension report eligibility is separate from entry/availability and rejects missing version',()=>{
 for(const lifecycle_status of ['ISSUED_NOT_ACTIVATED','ACTIVE','EXPIRING','EXTENSION_PROCESSING','EXTENDED','EXPIRED'])assert.equal(canReportVisaExtension({...item,lifecycle_status}),true);
 for(const lifecycle_status of ['NOT_ISSUED','CANCELLED','REFUSED','UNKNOWN'])assert.equal(canReportVisaExtension({...item,lifecycle_status}),false);
 for(const version of [undefined,0,NaN,Infinity,1.5])assert.equal(canReportVisaExtension({version,lifecycle_status:'ACTIVE'}),false);
});
test('retry retains exact body and kind/scope/version each bind a new explicit operation',()=>{
 let n=0;const key=()=>`synthetic-key-${++n}`;
 const a=prepareVisaExtensionRequest(null,'/api/web',item,'RECEIVED','2026-10-23','2027-12-31','2026-10-23',key);
 assert.equal(prepareVisaExtensionRequest(a,'/api/web',item,'RECEIVED','2026-10-23','2027-12-31','2026-10-24',key),a);
 for(const scope of ['/api/web','/mini-app'] as const){const b=prepareVisaExtensionRequest(a,scope,item,'APPLIED','2026-10-23','IGNORED','2026-10-23',key);assert.notEqual(b.body.idempotency_key,a.body.idempotency_key);assert.equal(b.body.reported_stay_end,null);}
 assert.notEqual(prepareVisaExtensionRequest(a,'/api/web',{...item,version:4},'RECEIVED','2026-10-23','2027-12-31','2026-10-23',key).signature,a.signature);
 assert.deepEqual(Object.keys(a.body).sort(),['expected_version','idempotency_key','kind','reported_on','reported_stay_end']);
});
test('strict date-only, Bali midnight, future/report/end ranges fail closed without legal defaults',()=>{
 assert.equal(visaBaliToday(new Date('2026-10-22T16:00:00Z')),'2026-10-23');
 for(const value of ['0000-01-01','2026-02-29','2026-1-01','2026-10-23T01:00Z',''])assert.equal(visaDateOnly(value),false);
 for(const [on,end] of [['2026-10-24',''],['2025-12-31',''],['2026-02-29',''],['2026-10-23','2026-12-31'],['2026-10-23','2026-10-23'],['2026-10-23','BAD']])assert.throws(()=>prepareVisaExtensionRequest(null,'/api/web',item,'RECEIVED',on,end,'2026-10-23',()=> 'synthetic-key'));
 const x=prepareVisaExtensionRequest(null,'/api/web',item,'RECEIVED','2026-10-23','','2026-10-23',()=> 'synthetic-key');assert.equal(x.body.reported_stay_end,null);
});
