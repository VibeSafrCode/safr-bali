import assert from "node:assert/strict";
import test from "node:test";
import { canReportVisaEntry, prepareVisaEntryRequest } from "../src/components/visaEntryRequest";

test("same case/version/date reuses its original key and body without regeneration", () => {
  const first=prepareVisaEntryRequest(null,11,3,"2026-10-23",()=>"synthetic-key-1");
  assert.strictEqual(prepareVisaEntryRequest(first,11,3,"2026-10-23",()=>{throw Error("must not regenerate");}),first);
  assert.deepEqual(first.body,{entered_on:"2026-10-23",expected_version:3,idempotency_key:"synthetic-key-1"});
});
test("changed actual payload creates a new request identity", () => {
  const first=prepareVisaEntryRequest(null,11,3,"2026-10-23",()=>"synthetic-key-1");
  for(const [id,version,date]of [[12,3,"2026-10-23"],[11,4,"2026-10-23"],[11,3,"2026-10-22"]]as const)
    assert.equal(prepareVisaEntryRequest(first,id,version,date,()=>"synthetic-key-2").body.idempotency_key,"synthetic-key-2");
});
test("missing or invalid version/date never starts a request", () => {
  for(const version of [undefined,0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1])
    assert.throws(()=>prepareVisaEntryRequest(null,11,version,"2026-10-23",()=>"unused-key"));
  for(const date of ["2026-02-30","2026-2-03","invalid","2026-10-23T00:00:00Z"])
    assert.throws(()=>prepareVisaEntryRequest(null,11,1,date,()=>"unused-key"));
  assert.throws(()=>prepareVisaEntryRequest(null,11,1,"2026-10-23",()=>""));
});
test("UI entry hint is false for terminal/unissued/legacy missing-version records", () => {
  for(const status of ["NOT_ISSUED","EXPIRED","CANCELLED","REFUSED","UNKNOWN"])
    assert.equal(canReportVisaEntry({version:1,entered_on:null,lifecycle_status:status}),false);
  assert.equal(canReportVisaEntry({entered_on:null,lifecycle_status:"ACTIVE"}),false);
  assert.equal(canReportVisaEntry({version:1,entered_on:"2026-10-23",lifecycle_status:"ACTIVE"}),false);
  for(const status of ["ISSUED_NOT_ACTIVATED","ACTIVE","EXPIRING","EXTENSION_PROCESSING","EXTENDED"])
    assert.equal(canReportVisaEntry({version:1,entered_on:null,lifecycle_status:status}),true);
});
