import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PUBLIC_INTERACTION_BUDGET as pin,PUBLIC_CSS_BUDGET as cssPin,validatePublicJavascriptBudget,validatePublicCssBudget} from './fixtures/public-asset-budgets.mjs';
const source=readFileSync(new URL('../../shared/content/client-ui/public-interactions.v1.json',import.meta.url));
const fixed=pin.files.map(row=>({name:'_astro/'+row.filename,bytes:readFileSync(new URL('../dist/_astro/'+row.filename,import.meta.url))}));
const small={name:'_astro/executable.js',bytes:Buffer.from('export const n=1;')};
test('only the independent exact interaction input and compiled asset get the bounded allowance',()=>{
  const result=validatePublicJavascriptBudget([...fixed,small],source);
  assert.equal(result.files,3);assert.equal(result.raw,pin.raw+small.bytes.length);
  assert.throws(()=>validatePublicJavascriptBudget([...fixed,small],Buffer.concat([source,Buffer.from(' ')])));
  for(const row of fixed){
    assert.throws(()=>validatePublicJavascriptBudget(fixed.filter(item=>item!==row),source));
    assert.throws(()=>validatePublicJavascriptBudget(fixed.map(item=>item===row?{...row,bytes:Buffer.concat([row.bytes,Buffer.from(' ')])}:item),source));
  }
  for(const rows of [
    [small],
    [...fixed,{...fixed[0],name:'_astro/public-interactions.Cjhhv-a0.js'}],
    [{...fixed[0],name:'_astro/public-interaction-captions.changed.js'},fixed[1],small],
    [...fixed,{...small,bytes:Buffer.alloc(16_001)}],
    [...fixed,small,small],
    [...fixed,...Array.from({length:5},(_,i)=>({name:'_astro/extra'+i+'.js',bytes:Buffer.alloc(15_001)}))],
  ])assert.throws(()=>validatePublicJavascriptBudget(rows,source));
});

test('fixed CSS allowance preserves all-file aggregate limits and rejects every unreviewed change',()=>{
  const fixed={name:'_astro/'+cssPin.filename,bytes:readFileSync(new URL('../dist/_astro/'+cssPin.filename,import.meta.url))};
  const small={name:'_astro/small.css',bytes:Buffer.from('body{color:red}')};
  assert.equal(validatePublicCssBudget([fixed,small]).raw,cssPin.raw+small.bytes.length);
  for(const rows of [
    [small],
    [fixed,{...fixed,name:'_astro/BaseLayout.another.css'}],
    [{...fixed,name:'_astro/BaseLayout.changed.css'},small],
    [{...fixed,bytes:Buffer.concat([fixed.bytes,Buffer.from(' ')])},small],
    [fixed,{...small,bytes:Buffer.alloc(155_001)}],
    [fixed,small,small],
    [fixed,{...small,bytes:Buffer.alloc(19_160)}],
  ])assert.throws(()=>validatePublicCssBudget(rows));
});
