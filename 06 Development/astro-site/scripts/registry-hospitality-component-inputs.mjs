// Exact three native origins; no public-derivative or generic-reader fallback.
import assert from 'node:assert/strict';
import sourceManifest from '../../shared/content/registry-hospitality-component-build.v1.json' with {type:'json'};
import {privateEditorialBytePrimitives as bytes} from './registry-private-editorial-inputs.mjs';
import {adjacentSha} from '../../shared/scripts/adjacent-business-source.mjs';
export const HOSPITALITY_SOURCE_ANCHOR='e4adfe16faa1d835ff9b3158322da9bc28f9a1bdccdb5d0ba540d75b73e4b2ca';
const manifestFile='registry-hospitality-component-build.v1.json';
const encoded=value=>JSON.stringify(value,null,2)+'\n';
export function hospitalitySourceManifest({contentRoot}={}){
  const raw=contentRoot===undefined?Buffer.from(encoded(sourceManifest)):
    bytes.readPinned(contentRoot,manifestFile,{expectedSha256:HOSPITALITY_SOURCE_ANCHOR}).bytes;
  assert.equal(adjacentSha(raw),HOSPITALITY_SOURCE_ANCHOR,'Hospitality source manifest drift');
  const manifest=JSON.parse(raw.toString('utf8'));
  assert.equal(raw.toString('utf8'),encoded(manifest));
  return manifest;
}
export function hospitalityPrivateInventory(options={}){
  const manifest=hospitalitySourceManifest(options);
  return {files:manifest.sourcePackets.map(({file,sha256})=>({file,sha256})),
    sourceManifestPins:[{file:manifestFile,sha256:HOSPITALITY_SOURCE_ANCHOR}]};
}
export function createHospitalityEditorialInputResolver({contentRoot,
  privateRoot=process.env.SAFR_PRIVATE_HOSPITALITY_EDITORIAL_INPUT_ROOT}={}){
  assert.equal(typeof privateRoot,'string','HOSPITALITY_PRIVATE_ROOT_REQUIRED');
  const inventory=hospitalityPrivateInventory({contentRoot}),state=bytes.verifyByteBundle(privateRoot,inventory);
  return file=>{
    hospitalitySourceManifest({contentRoot});
    assert.ok(inventory.files.some(row=>row.file===file),'UNBOUND_HOSPITALITY_PRIVATE_INPUT');
    return bytes.readBundleFile(state,file);
  };
}
let root,reader;
export function readHospitalityEditorialInput(file){
  const configured=process.env.SAFR_PRIVATE_HOSPITALITY_EDITORIAL_INPUT_ROOT;
  if(!reader||configured!==root){reader=createHospitalityEditorialInputResolver({privateRoot:configured});root=configured;}
  return reader(file);
}
