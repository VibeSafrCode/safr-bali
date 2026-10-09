import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {validateD12E28ABuild,D12_E28A_GATE_KEYS} from '../scripts/registry-d12-e28a-publication.mjs';
import {d12E28ASha as sha} from '../../shared/scripts/import-d12-e28a-bundle.mjs';

const root=new URL('../../shared/content/',import.meta.url),readContent=file=>readFileSync(new URL(file,root));
const registry=JSON.parse(readContent('service-registry.v1.json')),build=JSON.parse(readContent('registry-d12-e28a-build.v1.json'));
const pending=()=>{const manifest=structuredClone(build);manifest.stage='IMPORTED_PENDING_RENDER_QA';
  manifest.publicationGates=Object.fromEntries(D12_E28A_GATE_KEYS.map(key=>[key,false]));delete manifest.renderEvidence;
  for(const entry of manifest.records){entry.publication.indexable=false;entry.publication.gateStatus='PENDING_ACTUAL_RENDER_QA';}return manifest;};

test('seventy exact locale routes validate independently of actual local readiness',()=>{
  const entries=validateD12E28ABuild(pending(),registry,{readContent});assert.equal(entries.length,70);
  assert.equal(entries.filter(e=>e.indexable).length,0);assert.equal(new Set(entries.map(e=>e.route)).size,70);
  assert.equal(entries.filter(e=>e.locale==='ar'&&e.dir==='rtl').length,7);
  assert.equal(entries.find(e=>e.contentId==='d12'&&e.locale==='en').route,'/en/bali/visas/d12/');
});

test('changed body/source/SEO and fabricated readiness cannot enter a public build',()=>{
  const manifest=pending();manifest.stage='LOCAL_READY_NO_DEPLOY';
  manifest.publicationGates=Object.fromEntries(D12_E28A_GATE_KEYS.map(key=>[key,true]));
  for(const entry of manifest.records)entry.publication.indexable=true;
  assert.throws(()=>validateD12E28ABuild(manifest,registry,{readContent}));
  for(const file of [build.records[0].locales.ar.bodyFile,build.records[0].locales.ar.sourceFile,build.priceOccurrences.file,
    build.approvalEvidence.translationAuthorizationFile])assert.throws(()=>validateD12E28ABuild(pending(),registry,
      {readContent:requested=>requested===file?Buffer.concat([readContent(requested),Buffer.from('corrupt')]):readContent(requested)}));
  const altered=pending(),pin=altered.records[0].locales.ar,record=structuredClone(registry);
  const bytes=readContent(pin.metadataFile),meta=JSON.parse(bytes);meta.seoTitle='Changed SEO';
  const changed=Buffer.from(JSON.stringify(meta,null,2)+'\n');pin.metadataSha256=sha(changed);
  record.records.find(r=>r.contentId===altered.records[0].contentId).candidate.translations.ar.metadataSha256=sha(changed);
  assert.throws(()=>validateD12E28ABuild(altered,record,{readContent:file=>file===pin.metadataFile?changed:readContent(file)}));
});
