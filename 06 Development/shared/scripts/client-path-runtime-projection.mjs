/** Build-time projection of eleven already accepted client text identities.
 * Provenance replay is separate; this function grants no native/rendered QA,
 * caller activation, publication, or authority to create new translations. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const CLIENT_PATH_BASE_SHA256='aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a';
export const CLIENT_PATH_LOCALES=Object.freeze(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);
export const CLIENT_PATH_KEYS=Object.freeze([
  'theme.thailand.locative','theme.russia.locative','theme.nepal.locative','theme.uae.locative',
  'managerCard.description','catalog.noServices.detail','catalog.visaStart.title',
  'catalog.visaStart.detail','catalog.preparing.detail','catalog.sectionPreparing.detail','catalog.details',
]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const edges=s=>[s.match(/^\s*/u)[0],s.match(/\s*$/u)[0]];
const tokens=s=>(s.match(/\$?\{[^{}\r\n]*\}|[{}]/g)??[]).sort();
const plain=o=>o&&Object.getPrototypeOf(o)===Object.prototype&&Object.getOwnPropertySymbols(o).length===0&&
  Object.values(Object.getOwnPropertyDescriptors(o)).every(d=>'value'in d);
export function projectClientPathRuntime(baseBytes,rows){
  assert.ok(Buffer.isBuffer(baseBytes));assert.equal(baseBytes.length,188811);
  assert.equal(sha(baseBytes),CLIENT_PATH_BASE_SHA256,'Exact accepted343 external pin');
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(baseBytes),base=JSON.parse(text);
  assert.equal(text,JSON.stringify(base,null,2)+'\n');
  assert.deepEqual(Object.keys(base),['schemaVersion','domain','locales','entries']);
  assert.equal(base.schemaVersion,1);assert.equal(base.domain,'client');
  assert.deepEqual(base.locales,CLIENT_PATH_LOCALES);assert.equal(Object.keys(base.entries).length,343);
  assert.ok(Array.isArray(rows)&&rows.length===11);const additions={};
  for(const row of rows){
    assert.ok(plain(row));assert.deepEqual(Object.keys(row).sort(),['key','values']);
    assert.ok(CLIENT_PATH_KEYS.includes(row.key)&&!Object.hasOwn(additions,row.key)&&!Object.hasOwn(base.entries,row.key),'Exact unique client identities');
    assert.ok(plain(row.values));assert.deepEqual(Object.keys(row.values),CLIENT_PATH_LOCALES);
    for(const value of Object.values(row.values)){
      assert.ok(typeof value==='string'&&value.length>0&&value.length<=8192&&value.trim().length>0);
      assert.ok(!/[\0<>]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value),'Literal scalar only');
      assert.deepEqual(edges(value),edges(row.values.ru));assert.deepEqual(tokens(value),tokens(row.values.ru));
      if(row.key==='managerCard.description')assert.equal(value.split('Telegram/CRM').length-1,1,'Exact protected name');
    }
    assert.deepEqual(tokens(row.values.ru),row.key==='managerCard.description'?['{location}']:[]);
    additions[row.key]={...row.values};
  }
  assert.deepEqual(Object.keys(additions).sort(),[...CLIENT_PATH_KEYS].sort());
  const output={...base,entries:Object.fromEntries(Object.entries({...base.entries,...additions}).sort(([a],[b])=>a<b?-1:a>b?1:0))};
  assert.equal(Object.keys(output.entries).length,354);
  for(const[key,values]of Object.entries(base.entries))assert.deepEqual(output.entries[key],values,'All3430 old literal values unchanged');
  const bytes=Buffer.from(JSON.stringify(output,null,2)+'\n');
  return {bytes,sha256:sha(bytes),oldKeys:343,newKeys:11,oldValuesPreserved:3430,newValues:110,newForeignValues:88,newTranslations:0};
}
