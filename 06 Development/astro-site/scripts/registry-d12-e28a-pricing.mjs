// Source-pinned presentation only. No catalog, FX computation or mutable copy.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import occurrences from '../../shared/content/registry-copy/d12e28a_price_occurrences.json' with {type:'json'};
import {registryPriceTemplate} from './registry-price-bindings.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const keys=property=>property.replace(/\[(\d+)\]/g,'.$1').split('.');
const get=(payload,property)=>keys(property).reduce((value,key)=>value[key],payload);
const set=(payload,property,value)=>{const parts=keys(property),last=parts.pop();
  parts.reduce((object,key)=>object[key],payload)[last]=value;};
function verifySpan(field,span) {
  assert.ok(Number.isInteger(span.utf16Start)&&Number.isInteger(span.utf16End));
  assert.ok(span.utf16Start>=0&&span.utf16End>span.utf16Start);
  assert.equal(field.slice(span.utf16Start,span.utf16End),span.literal,'D12/E28A literal drift');
  assert.equal(Buffer.byteLength(field.slice(0,span.utf16Start)),span.utf8ByteStart);
  assert.equal(Buffer.byteLength(field.slice(0,span.utf16End)),span.utf8ByteEnd);
}

export function bindD12E28APayload(metadata,{contentId,locale}) {
  assert.equal(metadata.fullPayloadKind,'D12_E28A_FULL_MD_V1');
  assert.equal(metadata.locale,locale);
  const selected=occurrences.occurrences.filter(row=>row.contentId===contentId&&row.locale===locale);
  const fields=new Map();
  for(const pin of selected) {
    assert.equal(sha(metadata.bodyMarkdown),pin.bodySha256,'D12/E28A body drift');
    assert.equal(metadata.sourceRevision,pin.sourceRevision,'D12/E28A revision drift');
    assert.ok(Object.hasOwn(occurrences.operations,pin.operationId),'Unknown source price operation');
    const field=get(metadata,pin.fieldProperty);
    assert.equal(typeof field,'string');assert.equal(sha(field),pin.fieldSha256,'D12/E28A field drift');
    verifySpan(field,pin.fieldSpan);
    let end=pin.fieldSpan.utf16End;
    if(pin.usdWrapper) {
      verifySpan(field,pin.usdWrapper);
      assert.equal(pin.usdWrapper.utf16Start,end,'Non-adjacent USD wrapper');
      assert.match(pin.usdWrapper.literal,/^[ \t]*[（(][^()（）\n]*\{\{USD[_A-Z0-9]*\}\}[^()（）\n]*[)）]$/);
      end=pin.usdWrapper.utf16End;
    }
    const replacements=fields.get(pin.fieldProperty)??[];
    replacements.push({start:pin.fieldSpan.utf16Start,end,value:'{{CATALOG_PRICE:'+pin.operationId+'}}'});
    fields.set(pin.fieldProperty,replacements);
  }
  const bound=structuredClone(metadata);
  for(const [property,replacements] of fields) {
    let field=get(metadata,property),previous=field.length;
    for(const replacement of replacements.sort((a,b)=>b.start-a.start)) {
      assert.ok(replacement.end<=previous,'Overlapping D12/E28A source spans');
      field=field.slice(0,replacement.start)+replacement.value+field.slice(replacement.end);
      previous=replacement.start;
    }
    set(bound,property,field);
  }
  for(const property of ['bodyMarkdown','seo.title','seo.description','directAnswer',
    ...bound.faq.flatMap((_,i)=>['faq['+i+'].question','faq['+i+'].answerMarkdown'])])
    assert.doesNotMatch(get(bound,property),/\{\{USD[_A-Z0-9]*\}\}/,'Unbound D12/E28A USD token');
  return bound;
}
export const renderD12E28APriceTemplate=(template,projection,locale,now=Date.now())=>
  registryPriceTemplate(template,projection,locale,now);
