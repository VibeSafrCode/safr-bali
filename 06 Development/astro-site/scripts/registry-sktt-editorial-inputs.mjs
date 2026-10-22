// Separate strict eight-source inventory. No fallback to public projections.
import assert from 'node:assert/strict';
import sourceManifest from '../../shared/content/registry-sktt-editorial-build.v1.json' with {type:'json'};
import {privateEditorialBytePrimitives as bytes} from './registry-private-editorial-inputs.mjs';
import {sha256 as sha,SKTT_PACKETS} from '../../shared/scripts/sktt-editorial-source-readiness.mjs';
import {SKTT_LOCALES,encoded} from '../../shared/scripts/sktt-editorial-import.mjs';
export const SKTT_SOURCE_ANCHOR='c00f74b04ea319a6df2b878e8c31f1b37784a787755d3c3ed4d02f8056373adc';
const manifestFile='registry-sktt-editorial-build.v1.json';
export function skttPrivateInventory({contentRoot}={}){
  const raw=contentRoot===undefined?Buffer.from(encoded(sourceManifest)):
    bytes.readPinned(contentRoot,manifestFile,{expectedSha256:SKTT_SOURCE_ANCHOR}).bytes;
  assert.equal(sha(raw),SKTT_SOURCE_ANCHOR,'SKTT source manifest drift');
  const manifest=JSON.parse(raw.toString('utf8'));assert.equal(raw.toString('utf8'),encoded(manifest));
  assert.equal(manifest.records.length,1);assert.equal(manifest.records[0].contentId,'sktt');
  assert.deepEqual(manifest.sourcePackets,SKTT_PACKETS.map(p=>({...p})));
  assert.deepEqual(Object.keys(manifest.records[0].locales),SKTT_LOCALES);
  assert.deepEqual(manifest.missingLocales,['hi','ar']);assert.equal(manifest.fullTenLocaleSourceComplete,false);
  const files=SKTT_LOCALES.map(locale=>{
    const pin=manifest.records[0].locales[locale],stem='sktt_'+locale.toLowerCase().replaceAll('-','_')+'_native_20261003';
    assert.equal(pin.sourceFile,'registry-copy/'+stem+'.source.json');assert.match(pin.sourceFileSha256,/^[a-f0-9]{64}$/);
    return {file:pin.sourceFile,sha256:pin.sourceFileSha256};
  }).sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
  assert.equal(new Set(files.map(p=>p.file)).size,8);
  return {files,sourceManifestPins:[{file:manifestFile,sha256:SKTT_SOURCE_ANCHOR}]};
}
export function preparePrivateSkttEditorialBundle(sourceRoot,{contentRoot}={}){
  const inventory=skttPrivateInventory({contentRoot}),state=bytes.prepareByteBundle(sourceRoot,inventory);
  skttPrivateInventory({contentRoot});
  return {root:state.root,fileCount:8,manifestSha256:state.manifestSha256,totalBytes:state.total};
}
export function createSkttEditorialInputResolver({contentRoot,privateRoot=process.env.SAFR_PRIVATE_SKTT_EDITORIAL_INPUT_ROOT}={}){
  assert.equal(typeof privateRoot,'string','SKTT_PRIVATE_ROOT_REQUIRED');
  const inventory=skttPrivateInventory({contentRoot}),state=bytes.verifyByteBundle(privateRoot,inventory);
  return file=>{skttPrivateInventory({contentRoot});assert.ok(inventory.files.some(row=>row.file===file),'UNBOUND_SKTT_PRIVATE_INPUT');return bytes.readBundleFile(state,file);};
}
let root,reader;
export function readSkttEditorialInput(file){
  const configured=process.env.SAFR_PRIVATE_SKTT_EDITORIAL_INPUT_ROOT;
  if(!reader||configured!==root){reader=createSkttEditorialInputResolver({privateRoot:configured});root=configured;}
  return reader(file);
}
