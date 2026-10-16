// Separate ten-original inventory; existing base240 and bank10 remain unchanged.
import assert from 'node:assert/strict';
import sourceManifest from '../../shared/content/registry-vietnam-editorial-build.v1.json' with {type:'json'};
import {privateEditorialBytePrimitives as bytes} from './registry-private-editorial-inputs.mjs';
import {vietnamSha as sha,VIETNAM_PACKETS,VIETNAM_LOCALES} from '../../shared/scripts/vietnam-editorial-source.mjs';

export const VIETNAM_SOURCE_ANCHOR='defebc9a11676c8398a9cbeffaff32f66964cf4bcf5881a42c0cbab4c990c5df';
const manifestFile='registry-vietnam-editorial-build.v1.json';
export function vietnamPrivateInventory({contentRoot}={}){
  const raw=contentRoot===undefined?Buffer.from(JSON.stringify(sourceManifest,null,2)+'\n'):
    bytes.readPinned(contentRoot,manifestFile,{expectedSha256:VIETNAM_SOURCE_ANCHOR}).bytes;
  assert.equal(sha(raw),VIETNAM_SOURCE_ANCHOR,'Vietnam source manifest drift');
  const manifest=JSON.parse(raw.toString('utf8'));
  assert.equal(raw.toString('utf8'),JSON.stringify(manifest,null,2)+'\n');
  assert.equal(manifest.records.length,1);assert.equal(manifest.records[0].contentId,'vietnam');
  assert.deepEqual(manifest.sourcePackets,VIETNAM_PACKETS.map(p=>({...p})));
  const entry=manifest.records[0];
  assert.deepEqual(Object.keys(entry.locales).sort(),[...VIETNAM_LOCALES].sort());
  const files=VIETNAM_LOCALES.map(locale=>{
    const pin=entry.locales[locale],stem='vietnam_'+locale.toLowerCase().replaceAll('-','_')+'_native_20261006';
    assert.equal(pin.sourceFile,'registry-copy/'+stem+'.source.json');
    assert.match(pin.sourceFileSha256,/^[a-f0-9]{64}$/);
    return {file:pin.sourceFile,sha256:pin.sourceFileSha256};
  }).sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
  assert.equal(new Set(files.map(row=>row.file)).size,10);
  return {files,sourceManifestPins:[{file:manifestFile,sha256:VIETNAM_SOURCE_ANCHOR}]};
}
export function preparePrivateVietnamEditorialBundle(sourceRoot,{contentRoot}={}){
  const inventory=vietnamPrivateInventory({contentRoot}),state=bytes.prepareByteBundle(sourceRoot,inventory);
  vietnamPrivateInventory({contentRoot});
  return {root:state.root,fileCount:10,manifestSha256:state.manifestSha256,totalBytes:state.total};
}
export function createVietnamEditorialInputResolver({contentRoot,privateRoot=process.env.SAFR_PRIVATE_VIETNAM_EDITORIAL_INPUT_ROOT}={}){
  assert.equal(typeof privateRoot,'string','VIETNAM_PRIVATE_ROOT_REQUIRED');
  const inventory=vietnamPrivateInventory({contentRoot}),state=bytes.verifyByteBundle(privateRoot,inventory);
  return file=>{
    vietnamPrivateInventory({contentRoot});
    assert.ok(inventory.files.some(row=>row.file===file),'UNBOUND_VIETNAM_PRIVATE_INPUT');
    return bytes.readBundleFile(state,file);
  };
}
let root,reader;
export function readVietnamEditorialInput(file){
  const configured=process.env.SAFR_PRIVATE_VIETNAM_EDITORIAL_INPUT_ROOT;
  if(!reader||configured!==root){reader=createVietnamEditorialInputResolver({privateRoot:configured});root=configured;}
  return reader(file);
}
