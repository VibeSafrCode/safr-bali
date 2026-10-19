/** Build-time exact four-key extension. Customer strings are supplied only by
 * the separate native-ID/hash/source replay; this function grants no QA/release. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const ACCOUNT_RUNTIME_BASE_SHA256='071f7d8593b482f469a2e68c36bbe29a68eb62fcb63a5a3b44ede8ba03f58c1b';
export const ACCOUNT_RUNTIME_LOCALES=Object.freeze(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);
export const ACCOUNT_RUNTIME_KEYS=Object.freeze([
  'source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.overviewLead',
  'source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountPageCopy.profileLead',
  'source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.eyebrow',
  'source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountStatusCopy.loginDetail',
]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const edges=s=>[s.match(/^\s*/u)[0],s.match(/\s*$/u)[0]];
const tokens=s=>(s.match(/\$?\{[^{}\r\n]*\}|[{}]/g)??[]).sort();
const count=(text,token)=>text.split(token).length-1;
const expectedProtected=new Map([[ACCOUNT_RUNTIME_KEYS[0],'SAFRWAY'],[ACCOUNT_RUNTIME_KEYS[1],'Mini App'],[ACCOUNT_RUNTIME_KEYS[3],'Telegram']]);
export function projectAccountRuntime(baseBytes,rows){
  assert.ok(Buffer.isBuffer(baseBytes));assert.equal(baseBytes.length,184398);
  assert.equal(sha(baseBytes),ACCOUNT_RUNTIME_BASE_SHA256,'Original339 external pin');
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(baseBytes),base=JSON.parse(text);
  assert.equal(text,JSON.stringify(base,null,2)+'\n');assert.equal(base.domain,'client');
  assert.deepEqual(base.locales,ACCOUNT_RUNTIME_LOCALES);assert.equal(Object.keys(base.entries).length,339);
  assert.ok(Array.isArray(rows)&&rows.length===4);const additions={};
  for(const row of rows){
    assert.ok(row&&Object.getPrototypeOf(row)===Object.prototype);
    assert.deepEqual(Object.keys(row).sort(),['key','values']);
    assert.ok(ACCOUNT_RUNTIME_KEYS.includes(row.key)&&!Object.hasOwn(additions,row.key)&&!Object.hasOwn(base.entries,row.key),'Exact unique client identities');
    assert.ok(row.values&&Object.getPrototypeOf(row.values)===Object.prototype);
    assert.deepEqual(Object.keys(row.values),ACCOUNT_RUNTIME_LOCALES);
    for(const [locale,value]of Object.entries(row.values)){
      assert.ok(typeof value==='string'&&value.length>0&&value.length<=8192&&value.trim().length>0);
      assert.ok(!/[\0<>]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value),'Literal scalar only');
      assert.deepEqual(edges(value),edges(row.values.ru));assert.deepEqual(tokens(value),tokens(row.values.ru));
      const protectedToken=expectedProtected.get(row.key);
      if(protectedToken)assert.equal(count(value,protectedToken),1,'Preserve exact protected name');
    }
    additions[row.key]={...row.values};
  }
  assert.deepEqual(Object.keys(additions).sort(),[...ACCOUNT_RUNTIME_KEYS].sort());
  const output={...base,entries:Object.fromEntries(Object.entries({...base.entries,...additions}).sort(([a],[b])=>a<b?-1:a>b?1:0))};
  assert.equal(Object.keys(output.entries).length,343);
  for(const [key,value]of Object.entries(base.entries))assert.deepEqual(output.entries[key],value,'Old339 values unchanged');
  const bytes=Buffer.from(JSON.stringify(output,null,2)+'\n');
  return {bytes,sha256:sha(bytes),oldKeys:339,newKeys:4,oldValuesPreserved:3390,newValues:40};
}
