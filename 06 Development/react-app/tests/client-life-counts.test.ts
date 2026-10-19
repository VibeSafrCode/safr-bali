import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import test from 'node:test';import {createHash} from 'node:crypto';
import {createClientUiBindings} from '../src/i18n/client-ui-bindings';
import {clientLifeCountParts,clientLifeCountText,clientLifeCountNumber,type ClientLifeCountKey} from '../src/i18n/client-life-counts';
import {clientLifePrice,clientLifeText} from '../src/i18n/client-life-presentation';
import {clientVisaDatePresentation} from '../src/i18n/client-visa-presentation';
import {clientVisaLifeText,type ClientVisaLifeKey} from '../src/i18n/client-visa-life-copy';
import {formatLifePrice} from '../src/components/lifeServices';
import {compactLifePrice} from '../src/components/lifePriceDisplay';
import {visaDatePresentation} from '../src/components/visaDatePresentation';
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const source=process.env.SAFR_VISA_STATUS_COUNTS_SOURCE,nativeRoot=process.env.SAFR_VISA_LIFE_NATIVE_ROOT;
assert.ok(source&&nativeRoot,'Explicit private source pack/native root required');
const bytes=fs.readFileSync(source);assert.equal(sha(bytes),'1057f900b9725888769bf0981aff66b4ae00ae8a205dcc57ebb5186f4aa9ab57');
const pack=JSON.parse(bytes.toString('utf8'));
const dict=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../../shared/content/client-ui/client-life-counts.v1.json'),'utf8'));
const foreign=['zh-Hans','ko','fr','de','ja','hi','es','ar'] as const;
const locales=['ru','en',...foreign] as const;
const counts=[0,1,2,3,4,5,7,11,15,21,22,99,100,101,102,1000,1_000_000,Number.MAX_SAFE_INTEGER];
const read=(file:string,pin:string)=>{const b=fs.readFileSync(path.join(nativeRoot,file));assert.equal(sha(b),pin);return JSON.parse(b.toString('utf8'));};
const native16=read(pack.native16.file,pack.native16.sha256),native14=read(pack.original14.file,pack.original14.sha256);
const text16=native16.text,text14=native14.exactAssistantText??native14.text;
const blocks=(s:string)=>[...s.matchAll(/```json\s*\n([\s\S]*?)```/g)].map(m=>JSON.parse(m[1]));
test('actual native whole/excerpt replay and exactly4R2 replacements preserve other144 original014 values',()=>{
 const b16=blocks(text16),b14=blocks(text14);assert.equal(b16.length,32);assert.equal(b14.length,13);
 assert.equal(native16.assistantId,pack.native16.assistantId);
 for(const part of pack.sourceParts){assert.equal(part.nativeAssistantId,native16.assistantId);assert.equal(sha(text16),part.wholeAssistantSha256);const [a,b]=part.codepointSpan;const excerpt=[...text16].slice(a,b).join('');assert.equal(sha(excerpt),part.partSha256);assert.ok(excerpt.endsWith('END_'+part.taskId));}
 assert.deepEqual(Object.keys(dict),['schemaVersion','domain','locales','entries']);assert.equal(dict.domain,'client-life-counts');assert.deepEqual(dict.locales,foreign);assert.equal(Object.keys(dict.entries).length,4);
 let changed=0,preserved=0;
 for(let i=0;i<4;i++){
  const row=pack.countRows[i],original=b14[9+i],received=b16[28+i];
  const merge=JSON.parse(JSON.stringify(original));merge.ar.two=received.ar.two;
  assert.deepEqual(row.values,merge);assert.deepEqual(dict.entries[row.key],merge);
  for(const locale of foreign)for(const category of Object.keys(original[locale]))if(merge[locale][category]===original[locale][category])preserved++;else{assert.equal(locale,'ar');assert.equal(category,'two');changed++;}
 }
 const prepared=JSON.parse(fs.readFileSync(path.join(nativeRoot,'CLIENT_LIFE_NINE_LABELS_FOUR_WHOLE_COUNTS_8_DEV5_014_20261016_PREPARED_SOURCE.json'),'utf8'));
 const supplement=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../../shared/content/client-ui/client-visa-life-supplement.v1.json'),'utf8'));
 for(let i=0;i<9;i++)for(const locale of foreign){assert.equal(supplement.entries[prepared.ordinary[i].key][locale],b14[i][locale]);preserved++;}
 assert.equal(changed,4);assert.equal(preserved,144);
 for(let i=0;i<28;i++)for(const locale of foreign)assert.equal(pack.labelRows[i].values[locale],b16[i][locale]);
});
for(const locale of foreign)test('received whole-count grammar/category/number order for all4 contracts: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const row of pack.countRows)for(const count of counts){
  const key=row.key as ClientLifeCountKey;
  if(count===0&&(key==='life.countdown.expired'||key==='life.termDays')){assert.throws(()=>clientLifeCountParts(ui,key,count),/COUNT_DOMAIN/);continue;}
  const category=new Intl.PluralRules(locale).select(count),expected=row.values[locale][category];assert.equal(typeof expected,'string');
  const number=new Intl.NumberFormat(locale,{useGrouping:false,maximumFractionDigits:0}).format(count);
  const parts=clientLifeCountParts(ui,key,count);assert.ok(Object.isFrozen(parts));assert.equal(parts.category,category);assert.equal(parts.number,number);
  assert.equal(parts.before+parts.number+parts.after,expected.replace(row.placeholder,number));assert.equal(clientLifeCountText(ui,key,count),parts.text);assert.equal(/[{}]/.test(parts.text),false);
 }
});
test('count domain, finite key and authentic foreign bindings reject malformed/coercible values',()=>{
 const ui=createClientUiBindings('ar');let called=0;
 for(const value of [-1,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'2',{valueOf(){called++;return 2;}}])assert.throws(()=>clientLifeCountText(ui,'life.countdown.remaining',value as never),/COUNT_DOMAIN/);
 for(const key of ['__proto__','constructor','prototype','life.countdown.other'])assert.throws(()=>clientLifeCountText(ui,key as never,2),/COUNT_KEY/);
 for(const fake of [{}, {...ui},Object.create(ui)])assert.throws(()=>clientLifeCountText(fake as never,'life.termDays',2),/BINDING_ROLE_OR_PROVENANCE/);
 for(const locale of ['ru','en'] as const)assert.throws(()=>clientLifeCountText(createClientUiBindings(locale),'life.termDays',2),/FOREIGN_ONLY/);
 assert.equal(called,0);assert.equal(clientLifeCountNumber(ui,-0),clientLifeCountNumber(ui,0));
});
for(const locale of locales)test('price adapter preserves exact canonical decimal/compact output and only replaces unit: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const price_currency of ['IDR','USD','USDT','RUB'] as const)for(const price_unit of ['period','month','day','policy'] as const)for(const price_amount of [null,'invalid','0','0.00001','1000.50','999999999999999999999999.00100'])for(const compact of [false,true]){
  const item={price_currency,price_unit,price_amount},legacyLocale=locale==='ru'||locale==='en'?locale:'en';
  const canonical=(compact?compactLifePrice:formatLifePrice)(item,legacyLocale),actual=clientLifePrice(item,ui,compact);
  if(canonical===null||locale==='ru'||locale==='en')assert.equal(actual,canonical);
  else{const unit=clientLifeText(createClientUiBindings('en'),price_unit);assert.equal(actual,canonical.slice(0,-unit.length)+clientLifeText(ui,price_unit));}
 }
});
for(const locale of locales)test('visa date adapter keeps core precedence/value/estimated and changes only current label: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const entered_on of [null,'2026-10-01'])for(const entry_deadline of [null,'2026-11-01'])for(const stay_end of [null,'2026-12-01'])for(const expected_stay_end of [null,'2027-01-01']){
  const item={entered_on,entry_deadline,stay_end,expected_stay_end},core=visaDatePresentation(item,locale==='ru'?'ru':'en'),actual=clientVisaDatePresentation(item,ui);
  if(!core){assert.equal(actual,null);continue;}
  assert.equal(actual!.value,core.value);assert.equal(actual!.estimated,core.estimated);
  const id=core.estimated?'estimatedStayUntil':entered_on&&stay_end?'permittedStayUntil':'enterBy';
  assert.equal(actual!.label,clientVisaLifeText(ui,('source:06 Development/react-app/src/components/visaDatePresentation.ts#dates.'+id) as ClientVisaLifeKey));
 }
});
