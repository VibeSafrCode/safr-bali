import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PUBLIC_INTERACTION_LOCALES,PUBLIC_INTERACTION_KEYS,PUBLIC_INTERACTION_INPUT_SHA,
 publicInteractionText as serverText,publicInteractionCaptionPayload,
 serializePublicInteractionCaptions,serializeInertPublicJson} from '../src/lib/public-interactions.mjs';
import {PUBLIC_INTERACTION_LOCALE_SHA,parameters,publicInteractionSha256} from '../src/lib/public-interaction-contract.mjs';
import {parsePublicInteractionCaptions,publicInteractionText as clientText} from '../src/lib/public-interaction-captions.mjs';
const source=readFileSync(new URL('../../shared/content/client-ui/public-interactions.v1.json',import.meta.url));
const input=JSON.parse(source);
const sha=value=>createHash('sha256').update(value).digest('hex');
const variables=key=>Object.fromEntries((parameters[key]??[]).map(name=>[name,' \n$&$1</script>&😀\u2028 ']));

test('all460 captions retain exact source bytes, parameters, whitespace and independent locale pins',()=>{
 assert.equal(sha(source),PUBLIC_INTERACTION_INPUT_SHA);
 assert.equal(PUBLIC_INTERACTION_KEYS.length,46);assert.equal(PUBLIC_INTERACTION_LOCALES.length,10);
 for(const locale of PUBLIC_INTERACTION_LOCALES){
  const payload=publicInteractionCaptionPayload(locale),serialized=serializePublicInteractionCaptions(locale);
  assert.equal(sha(JSON.stringify(payload)),PUBLIC_INTERACTION_LOCALE_SHA[locale]);
  assert.equal(publicInteractionSha256(JSON.stringify(payload)),sha(JSON.stringify(payload)));
  assert.deepEqual(JSON.parse(serialized),payload);
  const read=parsePublicInteractionCaptions(serialized,locale);
  for(const entry of input.entries){
   assert.deepEqual(Buffer.from(payload.values[entry.key]),Buffer.from(entry.values[locale]));
   assert.equal(read(entry.key,locale,variables(entry.key)),serverText(entry.key,locale,variables(entry.key)));
  }
 }
});

test('inert JSON escapes script delimiters and Unicode separators without changing values',()=>{
 const value={text:' \n</script><script>alert(1)</script><>&\u2028\u2029😀$&$1 ',html:'<!--'};
 const serialized=serializeInertPublicJson(value);
 assert.doesNotMatch(serialized,/[<>&\u2028\u2029]/u);assert.deepEqual(JSON.parse(serialized),value);
 for(const text of ['', 'abc',value.text])assert.equal(publicInteractionSha256(text),sha(text));
});

test('malformed, changed, self-pinned, extra/missing, locale or token drift cannot fall back',()=>{
 const original=publicInteractionCaptionPayload('en');
 for(const mutate of [
  p=>p.schemaVersion=2,p=>p.sourceSha256='0'.repeat(64),p=>p.locale='ru',
  p=>p.values['support.close']+=' ',p=>delete p.values['support.close'],p=>p.values.extra='new',
  p=>p.values['support.close']='',p=>p.values['support.close']='\u0000',p=>p.values['support.close']=2,
  p=>p.values['theme.title']='lost parameters',p=>p.values['support.close']='{unknown}',
  p=>{p.values['support.close']='Changed';p.sha256=sha(JSON.stringify(p));},
 ]){const changed=structuredClone(original);mutate(changed);assert.throws(()=>parsePublicInteractionCaptions(JSON.stringify(changed),'en'));}
 for(const text of ['', '{', 'null', '[]'])assert.throws(()=>parsePublicInteractionCaptions(text,'en'));
 for(const locale of ['RU','en-US','xx',undefined])assert.throws(()=>parsePublicInteractionCaptions(JSON.stringify(original),locale));
 const read=parsePublicInteractionCaptions(JSON.stringify(original),'en');
 assert.throws(()=>read('support.close','ru'));assert.throws(()=>read('unknown','en'));
 for(const vars of [null,{}, {wrong:'value'},{names_preference_:true,names_next_:'dark'}])
  assert.throws(()=>read('theme.title','en',vars));
 assert.throws(()=>read('support.close','en',{extra:'value'}));
});

const rootFor=(locale,{count=1,type='application/json',text=serializePublicInteractionCaptions(locale)}={})=>({
 documentElement:{lang:locale,dataset:{uiLocale:locale}},
 querySelectorAll:()=>Array.from({length:count},()=>({textContent:text,getAttribute:()=>type})),
});
test('one correctly typed document payload is lazy, cached per document and locale-bound',()=>{
 for(const options of [{count:0},{count:2},{type:'text/javascript'},{text:'null'}])
  assert.throws(()=>clientText('support.close','en',{},rootFor('en',options)));
 const en=rootFor('en'),ru=rootFor('ru');let queries=0;
 const query=en.querySelectorAll;en.querySelectorAll=()=>{queries++;return query();};
 assert.equal(clientText('support.close','en',{},en),serverText('support.close','en'));
 assert.equal(clientText('support.close','en',{},en),serverText('support.close','en'));assert.equal(queries,1);
 assert.equal(clientText('support.close','ru',{},ru),serverText('support.close','ru'));
 assert.throws(()=>clientText('support.close','ru',{},en));
 en.documentElement.dataset.uiLocale='ru';assert.throws(()=>clientText('support.close','ru',{},en));
 assert.throws(()=>clientText('support.close','ru',{},rootFor('ru',{text:serializePublicInteractionCaptions('en')})));
});
