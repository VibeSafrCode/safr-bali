import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
const root=process.env.SAFR_VISA_LIFE_NATIVE_ROOT,source=process.env.SAFR_VISA_EXTERNAL38_SOURCE;
assert.ok(root&&source,'Explicit immutable native root and current source pack required');
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const packBytes=fs.readFileSync(source);assert.equal(sha(packBytes),'24cc715048756128cbf04724f76da5241d3d5563c756e2684c75981c6a869d55');
const pack=JSON.parse(packBytes.toString('utf8'));
const pins=[
 {n:'017',task:'FIRST4',sha:'5c5a367e589c4ce1ed34e354332c4f2bc685cf0712f5e41ab2bd469f1ecc16fa',assistant:'ce271c3b-a5f2-4886-bac6-3507a2de9ab6',text:'4dbcf14e1e0f08c5631561b2bbbb58f163189bab3dc3bfdfd68731a9bb401c49',prepared:'48b45fd34f8888a060036e4c2b75ddea8b03ddfe44234f3535fa037168c8c737',locales:['zh-Hans','ko','fr','de']},
 {n:'018',task:'OTHER4',sha:'2d8136929463de9d7ba651227ebb19e0991c83c7622a3e7d0adbb48cc04dfb00',assistant:'4d38ad57-fb1f-4f94-bb44-83de496c510f',text:'3258dcf3d72257efd9a0a1ac4d68fee052423732d0d2a94a1a7cabe894c3cb97',prepared:'7bd37846f91c93eb994fa2830a545c9f53cc62fa00fbb5c127d0a9cb3a3b7c5a',locales:['ja','hi','es','ar']},
];
test('current external38 pack replays all304 literal native customer values and exact current RUEN',()=>{
 assert.equal(pack.rows.length,38);assert.equal(new Set(pack.rows.map((r:any)=>r.key)).size,38);
 for(const pin of pins){
  const bytes=fs.readFileSync(path.join(root!,`DEV5_${pin.n}_FULL_LITERAL_SOURCE_NATIVE_20261018.json`));assert.equal(sha(bytes),pin.sha);const native=JSON.parse(bytes.toString('utf8'));
  const task=`CLIENT_VISA_CURRENT_EXTERNAL_HELP_${pin.task}_DEV5_${pin.n}_20261018`;
  assert.equal(native.task,task);assert.equal(native.assistantId,pin.assistant);assert.equal(sha(native.text),pin.text);assert.equal(native.originalFileDownloaded,false);assert.equal(native.originalFileSha256,null);assert.ok(native.text.includes('END_'+task));
  const preparedBytes=fs.readFileSync(path.join(root!,task+'_PREPARED_SOURCE.json'));assert.equal(sha(preparedBytes),pin.prepared);const prepared=JSON.parse(preparedBytes.toString('utf8'));
  const blocks=[...native.text.matchAll(/^#{1,6}\s+(?:\d+\.\s+)?(source:[^\r\n]+)\n+```json\s*\n([\s\S]*?)\n```/gm)];assert.equal(blocks.length,38);
  for(let i=0;i<38;i++){
   const m=blocks[i],received=JSON.parse(m[2]),row=pack.rows[i],original=prepared.rows[i];
   assert.equal(m[1],row.key);assert.equal(original.key,row.key);assert.equal(row.values.ru,original.ru);assert.equal(row.values.en,original.en);assert.deepEqual(Object.keys(received),pin.locales);
   for(const locale of pin.locales){assert.equal(row.values[locale],received[locale]);for(const token of ['SAFRWAY','In Progress','Pending','Decision'])assert.equal(received[locale].split(token).length,original.en.split(token).length);}
  }
 }
});
