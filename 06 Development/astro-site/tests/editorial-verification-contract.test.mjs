import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import readyGrant from '../../shared/content/registry-ready-editorial-public-build.v1.json' with {type:'json'};
import readySource from '../../shared/content/registry-ready-editorial-build.v1.json' with {type:'json'};
import draftGrant from '../../shared/content/registry-draft-editorial-public-build.v1.json' with {type:'json'};
import business from '../../shared/content/registry-business-build.v1.json' with {type:'json'};
import documents from '../../shared/content/registry-documents-build.v1.json' with {type:'json'};
import working from '../../shared/content/registry-working-build.v1.json' with {type:'json'};
import {validateReadyEditorialPublicBuild,validateReadyEditorialPublicDerivative} from '../scripts/registry-ready-editorial-publication.mjs';
import {validateDraftEditorialPublicBuild,validateDraftEditorialPublicDerivative} from '../scripts/registry-draft-editorial-publication.mjs';
import {derivePrivateEditorialBindings} from '../scripts/registry-private-editorial-inputs.mjs';
import {PRIVATE_ORIGINALS,PUBLIC_DERIVATIVE,editorialVerificationContract,editorialValidator} from '../scripts/registry-editorial-verification-contract.mjs';
import {verifyEditorialContract} from '../scripts/verify-editorial-contract.mjs';

const root=new URL('../../shared/content/',import.meta.url);
const read=file=>readFileSync(new URL(file,root));
const privateFiles=new Set(derivePrivateEditorialBindings().files.map(row=>row.file));
const publicRead=file=>{assert.ok(!privateFiles.has(file),'Public contract requested private original');return read(file);};
const encoded=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const builds={business,documents,working};

test('explicit contract selection is fail-closed; no CI or missing-file inference',()=>{
  assert.equal(editorialVerificationContract(PRIVATE_ORIGINALS),PRIVATE_ORIGINALS);
  assert.equal(editorialVerificationContract(PUBLIC_DERIVATIVE),PUBLIC_DERIVATIVE);
  for(const invalid of ['',null,'CI','SOURCE_VERIFIED','public_derivative',false])
    assert.throws(()=>editorialVerificationContract(invalid),/Unknown editorial verification contract/);
  const strict=()=>1,publicOnly=()=>2;
  assert.equal(editorialValidator(strict,publicOnly,PRIVATE_ORIGINALS),strict);
  assert.equal(editorialValidator(strict,publicOnly,PUBLIC_DERIVATIVE),publicOnly);
  assert.throws(()=>editorialValidator(strict,publicOnly,'other'));
  assert.throws(()=>verifyEditorialContract('other'));
  assert.throws(()=>verifyEditorialContract(),/Explicit editorial verification contract required/);
});

test('clean public inputs verify all240 entries but never attest private originals or release',()=>{
  const ready=validateReadyEditorialPublicDerivative(readyGrant,registry,{readContent:publicRead});
  const draft=validateDraftEditorialPublicDerivative(draftGrant,registry,{readContent:publicRead});
  assert.equal(ready.length,60);assert.equal(draft.length,180);
  const receipt=verifyEditorialContract(PUBLIC_DERIVATIVE,{readContent:publicRead});
  assert.equal(receipt.status,'PUBLIC_DERIVATIVE_VERIFIED');assert.equal(receipt.privateOriginals,'NOT_EXECUTED');
  assert.equal(receipt.privateOriginalCount,0);assert.equal(receipt.production,'NOT_EXECUTED');
  assert.equal(receipt.sourceQaPromoted,false);assert.equal(receipt.publicPrivateProjectionEquality,'NOT_EXECUTED');
  assert.equal(receipt.publicProjectionSha256,sha(JSON.stringify([...ready,...draft])));
  assert.equal(registry.records.find(r=>r.contentId==='student').candidate.translations.en.qa,'not_done');
});

test('strict entrypoints always require original bytes even when public contract is selected',()=>{
  const denyOriginal=file=>{if(privateFiles.has(file))throw Error('ORIGINAL_REQUIRED');return read(file);};
  assert.throws(()=>validateReadyEditorialPublicBuild(readyGrant,registry,{readContent:denyOriginal}),/ORIGINAL_REQUIRED/);
  assert.throws(()=>validateDraftEditorialPublicBuild(draftGrant,registry,{readContent:denyOriginal}),/ORIGINAL_REQUIRED/);
  assert.throws(()=>verifyEditorialContract(PRIVATE_ORIGINALS,{readContent:denyOriginal}),/ORIGINAL_REQUIRED/);
});

test('public derivative rejects changed body/metadata/public source bytes and source references',()=>{
  for(const [validate,grant,source] of [
    [validateReadyEditorialPublicDerivative,readyGrant,readySource],
    [validateDraftEditorialPublicDerivative,draftGrant,business],
  ]) {
    const id=source.records[0].contentId,record=registry.records.find(row=>row.contentId===id),payload=record.candidate.ru;
    for(const file of [payload.bodyFile,payload.metadataFile,...(source===business?[source.records[0].locales.ru.sourceFile]:[])])
      assert.throws(()=>validate(grant,registry,{readContent:name=>name===file?Buffer.concat([read(name),Buffer.from(' ')]):publicRead(name)}));
    for(const alter of [
      r=>{r.candidate.ru.bodySha256='0'.repeat(64);},
      r=>{r.candidate.ru.metadataFile='registry-copy/unbound.meta.json';},
      r=>{r.candidate.translations.en.qa='passed';},
      r=>{r.candidate.translations.en.sourceRevision='old';},
      r=>{r.candidate.route='/bali/unapproved/';},
      r=>{r.candidate.revision='sha256:'+'0'.repeat(64);},
      r=>{r.serviceId='secondService';},
      r=>{r.pricingRef={entityType:'SERVICE',entityKey:'new'};},
    ]) {
      const copy=structuredClone(registry);alter(copy.records.find(row=>row.contentId===id));
      assert.throws(()=>validate(grant,copy,{readContent:publicRead}));
    }
  }
});

test('fixed source and Owner anchors reject self-rehashed grants, missing/extra identities and locales',()=>{
  for(const [validate,grant] of [[validateReadyEditorialPublicDerivative,readyGrant],[validateDraftEditorialPublicDerivative,draftGrant]]) {
    for(const alter of [
      m=>{m.records.pop();},m=>{m.records.push(structuredClone(m.records[0]));},
      m=>{delete m.records[0].locales.en;},m=>{m.records[0].locales.unknown=structuredClone(m.records[0].locales.ru);},
      m=>{m.records[0].locales.ru.route='/other/';},
      m=>{m.authority.publisher='Author';},m=>{m.stage='DEPLOYED';},
      m=>{m.records[0].locales.ru.bodySha256='0'.repeat(64);m.records[0].locales.ru.contentVersion='sha256:'+'0'.repeat(64);},
    ]) {const copy=structuredClone(grant);alter(copy);assert.throws(()=>validate(copy,registry,{readContent:publicRead}));}
  }
  const changedReady=structuredClone(readySource);changedReady.records[0].locales.ru.sourceFileSha256='0'.repeat(64);
  const regrantedReady=structuredClone(readyGrant);regrantedReady.readySourceManifestSha256=sha(encoded(changedReady));
  assert.throws(()=>validateReadyEditorialPublicDerivative(regrantedReady,registry,{sourceManifest:changedReady,readContent:publicRead}),/source manifest drift/);
  for(const group of Object.keys(builds)) {
    const changedBuilds=structuredClone(builds);changedBuilds[group].records[0].locales.ru.sourceMarkdownSha256='0'.repeat(64);
    const regranted=structuredClone(draftGrant);regranted.sourceManifestSha256[group]=sha(encoded(changedBuilds[group]));
    assert.throws(()=>validateDraftEditorialPublicDerivative(regranted,registry,{builds:changedBuilds,readContent:publicRead}),/publication grant drift/);
    assert.throws(()=>validateDraftEditorialPublicDerivative(draftGrant,registry,{builds:changedBuilds,readContent:publicRead}),/source manifest drift/);
  }
});
