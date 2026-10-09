import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {validateE33GNextBuild,E33G_NEXT_GATE_KEYS} from '../scripts/registry-e33g-next-publication.mjs';
const root=new URL('../../shared/content/',import.meta.url),read=file=>readFileSync(new URL(file,root));
const registry=JSON.parse(read('service-registry.v1.json')),manifest=JSON.parse(read('registry-e33g-next-build.v1.json'));
const pending=()=>{const m=structuredClone(manifest);m.stage='IMPORTED_PENDING_RENDER_QA';m.publicationGates=Object.fromEntries(E33G_NEXT_GATE_KEYS.map(k=>[k,false]));delete m.renderEvidence;
  for(const r of m.records){r.publication.indexable=false;r.publication.gateStatus='PENDING_ACTUAL_RENDER_QA';}return m;};
test('40 localized full JSON publication entries retain source/SEO/service/route pins and no premature indexing',()=>{
  const entries=validateE33GNextBuild(pending(),registry,{readContent:read});assert.equal(entries.length,40);assert.equal(new Set(entries.map(e=>e.route)).size,40);
  assert.equal(entries.filter(e=>e.dir==='rtl').length,4);assert.ok(entries.every(e=>!e.indexable));assert.ok(entries.every(e=>e.title&&e.seoTitle&&e.description));
});
test('source body, metadata, JSON archive, price map or canonical binding drift fails closed',()=>{
  const m=pending(),pin=m.records[0].locales.ar;
  for(const file of [pin.bodyFile,pin.metadataFile,pin.sourceFile,pin.sourceMarkdownFile,m.sourceJsonPack.file,m.priceOccurrences.file])
    assert.throws(()=>validateE33GNextBuild(m,registry,{readContent:requested=>requested===file?Buffer.concat([read(file),Buffer.from('changed')]):read(requested)}));
  for(const mutate of [m=>m.records[0].canonicalPath='/bali/visas/changed/',m=>m.records[0].pricingRef=null,m=>delete m.records[0].locales.en,
    m=>m.records[0].sourceRevision='sha256:'+'0'.repeat(64)]){const wrong=pending();mutate(wrong);assert.throws(()=>validateE33GNextBuild(wrong,registry,{readContent:read}));}
});
test('all readiness gates need actual source-pinned evidence; booleans alone never authorize publication',()=>{
  const m=pending();m.stage='LOCAL_READY_NO_DEPLOY';m.publicationGates=Object.fromEntries(E33G_NEXT_GATE_KEYS.map(k=>[k,true]));for(const r of m.records)r.publication.indexable=true;
  assert.throws(()=>validateE33GNextBuild(m,registry,{readContent:read}));
  const falseClaim=pending();falseClaim.records[0].publication.indexable=true;assert.throws(()=>validateE33GNextBuild(falseClaim,registry,{readContent:read}));
});
