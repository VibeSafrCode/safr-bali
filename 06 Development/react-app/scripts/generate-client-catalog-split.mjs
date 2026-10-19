/** Deterministic derivatives of the byte-pinned canonical catalog. No translations. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createClientCatalogLookup,CLIENT_CATALOG_RUNTIME_BYTES,CLIENT_CATALOG_RUNTIME_SHA256,CLIENT_CATALOG_LOCALES} from '../src/i18n/client-catalog-runtime.ts';

const app=path.resolve(import.meta.dirname,'..'),shared=path.resolve(app,'../shared');
const raw=fs.readFileSync(shared+'/content/client-ui/client-catalog-runtime.v1.json');
const lookup=createClientCatalogLookup(new Uint8Array(raw)),data=JSON.parse(raw.toString('utf8'));
const source={bytes:CLIENT_CATALOG_RUNTIME_BYTES,sha256:CLIENT_CATALOG_RUNTIME_SHA256};
const ids=['e33g','d12','d1-d2','c1','voa'],contentId=id=>id==='d1-d2'?'d1_d2':id;
const digest=b=>createHash('sha256').update(b).digest('hex'),wire=x=>JSON.stringify(x,null,2)+'\n';
const fields=structuredClone(data.fields),destinations=structuredClone(data.baseDestinations),articleRefs={};
for(const id of ids){
  const key='catalog.bali.visas.'+id+'.content',ref={visaId:id,contentId:contentId(id)};
  assert.equal(fields[key].recipe,'registry_full_body');assert.equal(fields[key].contentId,ref.contentId);delete fields[key];
  const node=destinations.find(d=>d.id==='bali').services.find(s=>s.id==='visas').children.find(n=>n.id===id);
  assert.ok(Object.hasOwn(node,'content'));delete node.content;node.articleRef=ref;articleRefs[key]=ref;
}
assert.equal(Object.keys(fields).length,140);
const cards={schemaVersion:1,domain:'client-catalog-cards',source,locales:data.locales,destinationIds:data.destinationIds,baseDestinations:destinations,bikes:data.bikes,fields,heldKeys:data.heldKeys,articleRefs};
const outputs=new Map(),outRoot=shared+'/content/generated/client-catalog';
const cardWire=wire(cards);outputs.set(outRoot+'/cards.v1.json',cardWire);
const pins={schemaVersion:1,source,cards:{bytes:Buffer.byteLength(cardWire),sha256:digest(cardWire),fieldCount:140,articleRefs:5},visas:{}};
for(const id of ids){
  const articles=CLIENT_CATALOG_LOCALES.map(locale=>lookup.visaArticle(id,locale));
  assert.equal(articles.length,10);assert.ok(articles.every(a=>a.contentId===contentId(id)));
  const body=wire({schemaVersion:1,domain:'client-visa-pack',source,visaId:id,contentId:contentId(id),locales:CLIENT_CATALOG_LOCALES,articles});
  outputs.set(outRoot+'/'+id+'.v1.json',body);pins.visas[id]={bytes:Buffer.byteLength(body),sha256:digest(body),contentId:contentId(id)};
}
outputs.set(app+'/src/i18n/generated/client-catalog-split-pins.ts','/** Generated from the fixed canonical source; verify with catalog:generate. */\nexport const CLIENT_CATALOG_SPLIT_PINS = '+JSON.stringify(pins,null,2)+' as const;\n');
const check=process.argv.includes('--check');assert.ok(check||process.argv.includes('--write'),'Use --check or create-only --write');
for(const[file,expected]of outputs){
  if(fs.existsSync(file))assert.equal(fs.readFileSync(file,'utf8'),expected,'DERIVATIVE_DRIFT '+path.relative(app,file));
  else{assert.ok(!check,'MISSING_DERIVATIVE '+path.relative(app,file));fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,expected,{flag:'wx',mode:0o600});}
}
console.log(JSON.stringify({mode:check?'CHECK':'CREATE_ONLY',files:outputs.size,sourceBytes:raw.length,sourceSha256:digest(raw),fields:140,articleRefs:5,wholeArticles:50,articleSourceExact:true}));
