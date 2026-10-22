// Composite record is pinned independently; the original native8 validator
// still receives precisely its immutable old record. No native-kind relabeling.
import assert from 'node:assert/strict';
import nativeManifest from '../../shared/content/registry-sktt-editorial-build.v1.json' with {type:'json'};
import {sha256 as sha} from '../../shared/scripts/sktt-editorial-source-readiness.mjs';
import {encoded} from '../../shared/scripts/sktt-editorial-import.mjs';
import {SKTT_LOCAL_KIND,SKTT_LOCAL_LOCALES,SKTT_NATIVE_RECORD_SHA,SKTT_NATIVE_MANIFEST_SHA,
 skttLocalOriginalsFromWire,skttLocalProjection} from '../../shared/scripts/sktt-local-editorial-import.mjs';
import {metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';
import {skttLocalManifest,readSkttLocalEditorialInput} from './registry-sktt-local-editorial-inputs.mjs';
export function skttNativeRecordForValidation(record){
 assert.equal(sha(encoded(nativeManifest)),SKTT_NATIVE_MANIFEST_SHA,'Retained native manifest drift');
 if(sha(encoded(record))===SKTT_NATIVE_RECORD_SHA)return record;
 const entry=skttLocalManifest().records[0];
 assert.equal(sha(encoded(record)),entry.plannedRecordSha256,'Mixed SKTT record drift');
 const base=structuredClone(record);
 for(const locale of SKTT_LOCAL_LOCALES){
  const {direction,sourceFile,sourceFileSha256,...payload}=entry.locales[locale];
  assert.deepEqual(base.candidate.translations[locale],payload,'Mixed SKTT local payload drift');
  delete base.candidate.translations[locale];
 }
 assert.equal(sha(encoded(base)),SKTT_NATIVE_RECORD_SHA,'Native SKTT base drift');return base;
}
export function validateSkttLocalEditorialProjection(record,locale,payload,metadata,source){
 assert.ok(SKTT_LOCAL_LOCALES.includes(locale),'Unbound local SKTT locale');
 const entry=skttLocalManifest().records[0],pin=entry.locales[locale];
 assert.equal(sha(encoded(record)),entry.plannedRecordSha256,'Mixed SKTT record drift');
 skttNativeRecordForValidation(record);
 const {direction,sourceFile,sourceFileSha256,...expected}=pin;
 assert.deepEqual(payload,expected,'Local SKTT payload drift');
 assert.equal(sha(source),pin.bodySha256);assert.equal(sha(encoded(metadata)),pin.metadataSha256);
 assert.equal(metadata.fullPayloadKind,SKTT_LOCAL_KIND);assert.equal(metadata.locale,locale);assert.equal(metadata.direction,direction);
 assert.equal(metadata.bodyMarkdown,source);assert.equal(metadata.sourceFile,sourceFile);assert.equal(metadata.sourceFileSha256,sourceFileSha256);
 assert.equal(metadataEnvelope(source,metadata),pin.sourceEnvelopeSha256);
 return metadata;
}
export function validateSkttLocalEditorialOriginal(record,locale,payload,metadata,source,{readSource=readSkttLocalEditorialInput}={}){
 validateSkttLocalEditorialProjection(record,locale,payload,metadata,source);
 const pin=skttLocalManifest().records[0].locales[locale],bytes=Buffer.from(readSource(pin.sourceFile));
 assert.equal(sha(bytes),pin.sourceFileSha256,'Local SKTT private source drift');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),wire=JSON.parse(text);
 assert.equal(text,encoded(wire),'Local SKTT private envelope encoding drift');
 const inputs=skttLocalOriginalsFromWire(wire,locale),expected=skttLocalProjection(locale,inputs,{metadataEnvelope});
 assert.deepEqual(metadata,expected.metadata,'Local SKTT semantic/source projection drift');
 assert.deepEqual(payload,expected.payload);assert.equal(source,expected.metadata.bodyMarkdown);
 return metadata;
}
