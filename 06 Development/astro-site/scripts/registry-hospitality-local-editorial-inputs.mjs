// Exact local16 bundle, separate from native4/three origins and base240.
// A PUBLIC_DERIVATIVE profile never supplies missing source originals.
import assert from 'node:assert/strict';
import manifest from '../../shared/content/registry-hospitality-local-editorial-build.v1.json' with {type:'json'};
import {privateEditorialBytePrimitives as bytes} from './registry-private-editorial-inputs.mjs';
import {adjacentSha as sha} from '../../shared/scripts/adjacent-business-source.mjs';
import {encoded,HOSPITALITY_LOCAL_KIND,HOSPITALITY_LOCAL_MODE,HOSPITALITY_LOCAL_LOCALES,HOSPITALITY_COMPONENTS,
 HOSPITALITY_NATIVE_MANIFEST_SHA,HOSPITALITY_ROOT_ACCEPTANCE_SHA,HOSPITALITY_PEER_SHA,hospitalityLocalStem} from '../../shared/scripts/hospitality-local-editorial-source.mjs';
export const HOSPITALITY_LOCAL_SOURCE_ANCHOR='2d6eff50394b4ee1dd4f62f66b3baa267493504134ac716cbcd640eb3964d924';
const manifestFile='registry-hospitality-local-editorial-build.v1.json';
export function hospitalityLocalManifest(value=manifest){
 assert.equal(sha(encoded(value)),HOSPITALITY_LOCAL_SOURCE_ANCHOR,'Hospitality local source manifest drift');
 assert.equal(value.schemaVersion,1);assert.equal(value.kind,HOSPITALITY_LOCAL_KIND);assert.equal(value.sourceMode,HOSPITALITY_LOCAL_MODE);
 assert.equal(value.registryContentId,'hospitality');assert.equal(value.canonicalPath,'/bali/business/hospitality-licenses/');
 assert.equal(value.nativeSourceManifestSha256,HOSPITALITY_NATIVE_MANIFEST_SHA);
 assert.equal(value.rootSourceAcceptanceSha256,HOSPITALITY_ROOT_ACCEPTANCE_SHA);assert.equal(value.independentModelReviewSha256,HOSPITALITY_PEER_SHA);
 assert.deepEqual(value.localModelLocales,HOSPITALITY_LOCAL_LOCALES);assert.deepEqual(value.nativeReceivedLocales,['ru','en']);
 assert.deepEqual(value.receivedLocales,['ru','en',...HOSPITALITY_LOCAL_LOCALES]);assert.deepEqual(value.missingLocales,[]);
 assert.equal(value.fullTenLocaleSourceComplete,true);assert.equal(value.sourceStage,'SOURCE_COMPLETE_PREVIEW_ONLY_NOT_PUBLICATION');
 assert.equal(value.registryAssignmentConfirmed,false);assert.equal(value.publicationAuthorized,false);assert.ok(Object.values(value.gates).every(v=>v===false));
 assert.deepEqual(value.variants.map(row=>row.component+'/'+row.locale),HOSPITALITY_COMPONENTS.flatMap(component=>HOSPITALITY_LOCAL_LOCALES.map(locale=>component+'/'+locale)));
 return value;
}
export function hospitalityLocalPrivateInventory({contentRoot}={}){
 const raw=contentRoot===undefined?Buffer.from(encoded(manifest)):
  bytes.readPinned(contentRoot,manifestFile,{expectedSha256:HOSPITALITY_LOCAL_SOURCE_ANCHOR}).bytes;
 assert.equal(sha(raw),HOSPITALITY_LOCAL_SOURCE_ANCHOR,'Hospitality local manifest bytes drift');
 const value=JSON.parse(raw.toString('utf8'));assert.equal(raw.toString('utf8'),encoded(value));hospitalityLocalManifest(value);
 const files=value.variants.map(pin=>{
  assert.equal(pin.sourceFile,'registry-copy/'+hospitalityLocalStem(pin.component,pin.locale)+'.source.json');
  assert.match(pin.sourceFileSha256,/^[a-f0-9]{64}$/);return {file:pin.sourceFile,sha256:pin.sourceFileSha256};
 }).sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
 return {files,sourceManifestPins:[{file:manifestFile,sha256:HOSPITALITY_LOCAL_SOURCE_ANCHOR}]};
}
export function preparePrivateHospitalityLocalEditorialBundle(sourceRoot,{contentRoot}={}){
 const inventory=hospitalityLocalPrivateInventory({contentRoot}),state=bytes.prepareByteBundle(sourceRoot,inventory);
 hospitalityLocalPrivateInventory({contentRoot});return {root:state.root,fileCount:16,manifestSha256:state.manifestSha256,totalBytes:state.total};
}
export function createHospitalityLocalEditorialInputResolver({contentRoot,privateRoot=process.env.SAFR_PRIVATE_HOSPITALITY_LOCAL_EDITORIAL_INPUT_ROOT}={}){
 assert.equal(typeof privateRoot,'string','HOSPITALITY_LOCAL_PRIVATE_ROOT_REQUIRED');
 const inventory=hospitalityLocalPrivateInventory({contentRoot}),state=bytes.verifyByteBundle(privateRoot,inventory);
 return file=>{hospitalityLocalPrivateInventory({contentRoot});assert.ok(inventory.files.some(row=>row.file===file),'UNBOUND_HOSPITALITY_LOCAL_PRIVATE_INPUT');return bytes.readBundleFile(state,file);};
}
let root,reader;
export function readHospitalityLocalEditorialInput(file){
 const configured=process.env.SAFR_PRIVATE_HOSPITALITY_LOCAL_EDITORIAL_INPUT_ROOT;
 if(!reader||configured!==root){reader=createHospitalityLocalEditorialInputResolver({privateRoot:configured});root=configured;}
 return reader(file);
}
