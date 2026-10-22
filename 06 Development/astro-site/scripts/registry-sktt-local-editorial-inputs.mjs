// Separate exact two-input private inventory. Never falls back to native8,
// base240, checked-in public projections or a caller-supplied mode/inventory.
import assert from 'node:assert/strict';
import manifest from '../../shared/content/registry-sktt-local-editorial-build.v1.json' with {type:'json'};
import {privateEditorialBytePrimitives as bytes} from './registry-private-editorial-inputs.mjs';
import {sha256 as sha} from '../../shared/scripts/sktt-editorial-source-readiness.mjs';
import {encoded} from '../../shared/scripts/sktt-editorial-import.mjs';
import {SKTT_LOCAL_LOCALES,SKTT_ROOT_ACCEPTANCE_SHA,SKTT_NATIVE_MANIFEST_SHA,SKTT_NATIVE_RECORD_SHA,SKTT_RU_SHA} from '../../shared/scripts/sktt-local-editorial-import.mjs';
export const SKTT_LOCAL_SOURCE_ANCHOR='c6bf6a5679914e9d2fa275dff8534ef5a6baf6640da9773a0a8017d4c8eac5a8';
export function skttLocalManifest(value=manifest){
 assert.equal(sha(encoded(value)),SKTT_LOCAL_SOURCE_ANCHOR,'SKTT local manifest anchor drift');
 assert.equal(value.schemaVersion,1);assert.equal(value.fullPayloadKind,'SKTT_MIXED_SOURCE_TEN_LOCALE_PREVIEW_V1');
 assert.equal(value.sourceMode,'NATIVE_EIGHT_PLUS_EXPLICIT_LOCAL_TWO');
 assert.equal(value.nativeSourceManifestSha256,SKTT_NATIVE_MANIFEST_SHA);
 assert.equal(value.retainedNativeRecordSha256,SKTT_NATIVE_RECORD_SHA);assert.equal(value.sourceRevision,'sha256:'+SKTT_RU_SHA);
 assert.deepEqual(value.localModelLocales,SKTT_LOCAL_LOCALES);assert.deepEqual(value.missingLocales,[]);
 assert.equal(value.rootSourceAcceptanceSha256,SKTT_ROOT_ACCEPTANCE_SHA);
 assert.equal(value.fullTenLocaleSourceComplete,true);assert.equal(value.sourceStage,'SOURCE_COMPLETE_PREVIEW_ONLY_NOT_PUBLICATION');
 assert.ok(Object.values(value.publicationGates).every(v=>v===false));
 assert.equal(value.records.length,1);assert.equal(value.records[0].contentId,'sktt');
 assert.equal(value.records[0].canonicalPath,'/bali/documents/sktt/');
 assert.deepEqual(Object.keys(value.records[0].locales),SKTT_LOCAL_LOCALES);
 return value;
}
export function skttLocalPrivateInventory({contentRoot}={}){
 const file='registry-sktt-local-editorial-build.v1.json';
 const raw=contentRoot===undefined?Buffer.from(encoded(manifest)):bytes.readPinned(contentRoot,file,{expectedSha256:SKTT_LOCAL_SOURCE_ANCHOR}).bytes;
 assert.equal(sha(raw),SKTT_LOCAL_SOURCE_ANCHOR,'SKTT local source manifest drift');
 const value=JSON.parse(raw.toString('utf8'));assert.equal(raw.toString('utf8'),encoded(value));skttLocalManifest(value);
 const files=SKTT_LOCAL_LOCALES.map(locale=>{
  const pin=value.records[0].locales[locale];assert.equal(pin.sourceFile,'registry-copy/sktt_'+locale+'_local_model_20261022.source.json');
  assert.match(pin.sourceFileSha256,/^[a-f0-9]{64}$/);return {file:pin.sourceFile,sha256:pin.sourceFileSha256};
 }).sort((a,b)=>a.file.localeCompare(b.file,'en'));
 return {files,sourceManifestPins:[{file,sha256:SKTT_LOCAL_SOURCE_ANCHOR}]};
}
export function preparePrivateSkttLocalEditorialBundle(sourceRoot,{contentRoot}={}){
 const inventory=skttLocalPrivateInventory({contentRoot}),state=bytes.prepareByteBundle(sourceRoot,inventory);
 skttLocalPrivateInventory({contentRoot});return {root:state.root,fileCount:2,manifestSha256:state.manifestSha256,totalBytes:state.total};
}
export function createSkttLocalEditorialInputResolver({contentRoot,privateRoot=process.env.SAFR_PRIVATE_SKTT_LOCAL_EDITORIAL_INPUT_ROOT}={}){
 assert.equal(typeof privateRoot,'string','SKTT_LOCAL_PRIVATE_ROOT_REQUIRED');
 const inventory=skttLocalPrivateInventory({contentRoot}),state=bytes.verifyByteBundle(privateRoot,inventory);
 return file=>{skttLocalPrivateInventory({contentRoot});assert.ok(inventory.files.some(row=>row.file===file),'UNBOUND_SKTT_LOCAL_PRIVATE_INPUT');return bytes.readBundleFile(state,file);};
}
let root,reader;
export function readSkttLocalEditorialInput(file){
 const configured=process.env.SAFR_PRIVATE_SKTT_LOCAL_EDITORIAL_INPUT_ROOT;
 if(!reader||configured!==root){reader=createSkttLocalEditorialInputResolver({privateRoot:configured});root=configured;}
 return reader(file);
}
