// Additional bank originals. The pre-existing240 contract is deliberately unchanged.
import assert from 'node:assert/strict';
import sourceManifest from '../../shared/content/registry-bank-editorial-build.v1.json' with {type:'json'};
import {privateEditorialBytePrimitives as bytes} from './registry-private-editorial-inputs.mjs';
import {bankSha,BANK_PACKETS,BANK_LOCALES} from '../../shared/scripts/bank-editorial-source.mjs';

export const BANK_SOURCE_ANCHOR='985d7eff08477ffc2b1cad2bbcaa4a817440faa733b8b7bd11b7eda5b511bc6d';
const manifestFile='registry-bank-editorial-build.v1.json';
export function bankPrivateInventory({contentRoot}={}){
  // Imported JSON also works inside Astro's build-time SSR bundle. Source pins
  // are checked again on every read; the freeze separately binds its file bytes.
  const raw=contentRoot===undefined?Buffer.from(JSON.stringify(sourceManifest,null,2)+'\n'):
    bytes.readPinned(contentRoot,manifestFile,{expectedSha256:BANK_SOURCE_ANCHOR}).bytes;
  assert.equal(bankSha(raw),BANK_SOURCE_ANCHOR,'Bank source anchor drift');
  const manifest=JSON.parse(raw.toString('utf8'));
  assert.equal(raw.toString('utf8'),JSON.stringify(manifest,null,2)+'\n');
  assert.equal(manifest.records.length,1);assert.equal(manifest.records[0].contentId,'bank');
  assert.deepEqual(manifest.sourcePackets,BANK_PACKETS.map(pin=>({...pin})));
  const entry=manifest.records[0];assert.deepEqual(Object.keys(entry.locales).sort(),[...BANK_LOCALES].sort());
  const files=BANK_LOCALES.map(locale=>{
    const pin=entry.locales[locale],name='bank_'+locale.toLowerCase().replaceAll('-','_')+'_native_20261003.source.json';
    assert.equal(pin.sourceFile,'registry-copy/'+name);assert.match(pin.sourceFileSha256,/^[a-f0-9]{64}$/);
    return {file:pin.sourceFile,sha256:pin.sourceFileSha256};
  }).sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
  assert.equal(new Set(files.map(row=>row.file)).size,10);
  return {files,sourceManifestPins:[{file:manifestFile,sha256:BANK_SOURCE_ANCHOR}]};
}
export function preparePrivateBankEditorialBundle(sourceRoot,{contentRoot}={}){
  const inventory=bankPrivateInventory({contentRoot});
  const state=bytes.prepareByteBundle(sourceRoot,inventory);
  bankPrivateInventory({contentRoot});
  return {root:state.root,fileCount:10,manifestSha256:state.manifestSha256,totalBytes:state.total};
}
export function createBankEditorialInputResolver({contentRoot,privateRoot=process.env.SAFR_PRIVATE_BANK_EDITORIAL_INPUT_ROOT}={}){
  assert.equal(typeof privateRoot,'string','BANK_PRIVATE_ROOT_REQUIRED');
  const inventory=bankPrivateInventory({contentRoot}),state=bytes.verifyByteBundle(privateRoot,inventory);
  return file=>{
    bankPrivateInventory({contentRoot});
    assert.ok(inventory.files.some(row=>row.file===file),'UNBOUND_BANK_PRIVATE_INPUT');
    return bytes.readBundleFile(state,file);
  };
}
let root,reader;
export function readBankEditorialInput(file){
  const configured=process.env.SAFR_PRIVATE_BANK_EDITORIAL_INPUT_ROOT;
  if(!reader||configured!==root){reader=createBankEditorialInputResolver({privateRoot:configured});root=configured;}
  return reader(file);
}
