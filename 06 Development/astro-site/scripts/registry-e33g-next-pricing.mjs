// Approved-source span binding only. Price/FX authority remains the catalog.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import occurrences from '../../shared/content/registry-copy/e33g_next_price_occurrences.json' with {type:'json'};
import {registryPriceTemplate} from './registry-price-bindings.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const keys=property=>property.replace(/\[(\d+)\]/g,'.$1').split('.');
const get=(payload,property)=>keys(property).reduce((value,key)=>value[key],payload);
const set=(payload,property,value)=>{const parts=keys(property),last=parts.pop();parts.reduce((object,key)=>object[key],payload)[last]=value;};
function verifySpan(field,span) {
  assert.ok(Number.isInteger(span.utf16Start)&&Number.isInteger(span.utf16End));
  assert.ok(span.utf16Start>=0&&span.utf16End>span.utf16Start);
  assert.equal(field.slice(span.utf16Start,span.utf16End),span.literal,'E33G next-stage source literal drift');
  assert.equal(Buffer.byteLength(field.slice(0,span.utf16Start)),span.utf8ByteStart);
  assert.equal(Buffer.byteLength(field.slice(0,span.utf16End)),span.utf8ByteEnd);
}
export function bindE33GNextPayload(metadata,{contentId,locale}) {
  assert.equal(metadata.fullPayloadKind,'E33G_NEXT_FULL_JSON_V1');assert.equal(metadata.resolvedContentId,contentId);assert.equal(metadata.locale,locale);
  const selected=occurrences.occurrences.filter(row=>row.contentId===contentId&&row.locale===locale);assert.ok(selected.length,'Unknown E33G next-stage payload');
  const fields=new Map();
  for(const pin of selected) {
    assert.equal(sha(metadata.bodyMarkdown),pin.bodySha256,'E33G next-stage body drift');assert.equal(metadata.sourceRevision,pin.sourceRevision,'E33G next-stage revision drift');
    assert.ok(Object.hasOwn(occurrences.operations,pin.operationId),'Unknown source price operation');
    const field=get(metadata,pin.fieldProperty);assert.equal(typeof field,'string');assert.equal(sha(field),pin.fieldSha256,'E33G next-stage field drift');verifySpan(field,pin.fieldSpan);
    assert.equal(pin.usdWrapper,null,'No supplied USD placeholder in this package');
    let variant=pin.operationId;
    if(pin.operationIds) {
      assert.deepEqual(pin.operationIds,['conversion_from_voa','conversion_from_d12'],'Only approved dual-route quoted price');
      assert.equal(pin.operationId,'conversion_from_voa');variant='e33g-conversion-voa-d12-equal';
    }
    const replacements=fields.get(pin.fieldProperty)??[];
    replacements.push({start:pin.fieldSpan.utf16Start,end:pin.fieldSpan.utf16End,value:'{{CATALOG_PRICE:'+variant+'}}'});fields.set(pin.fieldProperty,replacements);
  }
  const bound=structuredClone(metadata);
  for(const [property,replacements] of fields) {
    let field=get(metadata,property),previous=field.length;
    for(const replacement of replacements.sort((a,b)=>b.start-a.start)) {
      assert.ok(replacement.end<=previous,'Overlapping E33G next-stage source spans');field=field.slice(0,replacement.start)+replacement.value+field.slice(replacement.end);previous=replacement.start;
    }
    set(bound,property,field);
  }
  return bound;
}
export const renderE33GNextPriceTemplate=(template,projection,locale,now=Date.now())=>registryPriceTemplate(template,projection,locale,now);
