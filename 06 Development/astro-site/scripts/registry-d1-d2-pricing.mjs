// Server-only presentation binding. Exact supplied JSON/MD remain immutable.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import occurrences from '../../shared/content/registry-copy/d1d2_price_occurrences.json' with {type:'json'};
import {registryPriceTemplate} from './registry-price-bindings.mjs';

export const d1PageKeys=Object.freeze({d1:'d1',d2:'d2',d1_d2:'d1_d2',
  d1_d2_extension:'d1_d2_extension',knowledge_d1_d2_extension:'knowledge_extension',
  knowledge_d1_d2_documents:'knowledge_documents'});
const hash=value=>createHash('sha256').update(value).digest('hex');
const parts=property=>property.replace(/\[(\d+)\]/g,'.$1').split('.');
const get=(payload,property)=>parts(property).reduce((value,key)=>value[key],payload);
const set=(payload,property,value)=>{const keys=parts(property),last=keys.pop();
  keys.reduce((object,key)=>object[key],payload)[last]=value;};
const token=operation=>'{{CATALOG_PRICE:'+operation+'}}';

function verifySpan(field,span) {
  assert.ok(Number.isInteger(span.utf16Start)&&Number.isInteger(span.utf16End));
  assert.ok(span.utf16Start>=0&&span.utf16End>span.utf16Start);
  assert.equal(field.slice(span.utf16Start,span.utf16End),span.literal,'D1 price span drift');
  assert.equal(Buffer.byteLength(field.slice(0,span.utf16Start)),span.utf8ByteStart);
  assert.equal(Buffer.byteLength(field.slice(0,span.utf16End)),span.utf8ByteEnd);
}

/** Replace only exact field spans, never a globally matching amount. The 5m
 * initial D1 and two extension stages are intentionally different operations. */
export function bindD1Payload(metadata,{contentId,locale}) {
  const pageKey=d1PageKeys[contentId];
  assert.ok(pageKey&&metadata.fullPayloadKind==='D1_D2_FULL_JSON_V1');
  assert.equal(metadata.pageKey,pageKey);assert.equal(metadata.locale,locale);
  assert.equal(metadata.bodyRevision,'sha256:'+hash(metadata.bodyMarkdown));
  const fields=new Map();
  const add=(property,fieldHash,span,usd,operation)=>{
    const field=get(metadata,property);
    assert.equal(typeof field,'string');assert.equal(hash(field),fieldHash,'D1 price field hash drift');
    verifySpan(field,span);
    let end=span.utf16End;
    if(usd) {
      verifySpan(field,usd);
      // All supplied locale wrappers are pinned to their own exact span. Keep
      // Hindi/Arabic/CJK prose elsewhere; the projection provides one USD suffix.
      const between=field.slice(end,usd.utf16Start);
      assert.match(between,/^[ \t]*[（(][^()（）\n]*$/,'Unexpected authored USD wrapper');
      assert.ok([')','）'].includes(field[usd.utf16End]),'Unclosed authored USD wrapper');
      end=usd.utf16End+1;
    }
    const replacements=fields.get(property)??[];
    replacements.push({start:span.utf16Start,end,value:token(operation)});
    fields.set(property,replacements);
  };
  for(const occurrence of occurrences.occurrences.filter(row=>row.pageKey===pageKey)) {
    const pin=occurrence.locales[locale];assert.ok(pin,'Missing localized D1 occurrence');
    assert.equal(metadata.bodyRevision,pin.bodyRevision);
    assert.equal(metadata.payloadRevision,pin.payloadRevision);
    assert.ok(Object.hasOwn(occurrences.operations,occurrence.operationId));
    add(pin.fieldProperty,pin.fieldSha256,pin.fieldSpan,pin.usdToken?.fieldSpan,occurrence.operationId);
    for(const mirror of pin.mirrors)add(mirror.property,mirror.fieldSha256,
      mirror.span,mirror.usdToken,occurrence.operationId);
  }
  const payload=structuredClone(metadata);
  for(const [property,replacements] of fields) {
    const sorted=replacements.sort((a,b)=>b.start-a.start);
    let field=get(metadata,property),previous=field.length;
    for(const replacement of sorted) {
      assert.ok(replacement.end<=previous,'Overlapping D1 price spans');
      field=field.slice(0,replacement.start)+replacement.value+field.slice(replacement.end);
      previous=replacement.start;
    }
    set(payload,property,field);
  }
  // Unbound USD or authored commercial money is a source/map error, not a
  // reason to fall back to an independent fixed price in an emitted page.
  for(const property of ['bodyMarkdown','factBlockMarkdown','seo.description',
    ...payload.faq.map((_,i)=>'faq['+i+'].answerMarkdown')])
    assert.doesNotMatch(get(payload,property),/\{\{USD[_A-Z0-9]*\}\}/,'Unbound D1 USD token');
  return payload;
}

export function renderPriceTemplate(template,projection,locale,now=Date.now()) {
  return registryPriceTemplate(template,projection,locale,now);
}
