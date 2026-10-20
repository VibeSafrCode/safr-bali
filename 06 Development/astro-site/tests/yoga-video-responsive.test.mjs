// Source regression for the observed 320px transferred-minimum overflow.
// Actual 320/390/1280 geometry, focus and video presentation remain a rendered gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const css=readFileSync(new URL('../src-york/styles/york.css',import.meta.url),'utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');
function stageContract(source){
  const matches=[...source.matchAll(/(?:^|\})\.video-stage\{([^}]+)\}/g)];
  const primary=matches.filter(m=>m[1].includes('position:relative'));assert.equal(primary.length,1);
  const declarations=primary[0][1].split(';').filter(Boolean).map(v=>v.split(':'));
  const props=new Map(declarations);assert.equal(props.size,declarations.length,'No duplicate stage declaration');
  assert.equal(props.get('aspect-ratio'),'16/9');assert.equal(props.get('min-width'),'0');assert.equal(props.get('min-height'),'0');
  assert.equal(props.get('max-width'),'920px');assert.equal(props.get('margin'),'auto');assert.equal(props.get('overflow'),'hidden');
}
test('video stage has zero transferred minima and keeps local 16:9/max920 boundary',()=>stageContract(css));
test('returning the former 200px floor is rejected, not hidden globally',()=>{
  const repaired='aspect-ratio:16/9;min-width:0;min-height:0;',old='aspect-ratio:16/9;min-height:200px;';
  assert.equal(css.split(repaired).length,2);assert.throws(()=>stageContract(css.replace(repaired,old)));
  assert.equal(sha(css.replace(repaired,old)),'4fdeed0fce766618089feebd844d3f144c202dcd70f669a040de26fa014faf64','All unrelated CSS bytes remain exact');
});
test('video component and click-only player are byte-exact to the reviewed baseline',()=>{
  for(const [name,pin] of [['components/YouTubeSection.astro','603791f5369958a552b189507c9938c73450446b4d1720379d8855d52595a9b8'],['client/yoga-video.js','e9a5b02546e522309aeb74378cb70fa9d73551e92c8089c95bc0d776f80acafe']])assert.equal(sha(readFileSync(new URL('../src-york/'+name,import.meta.url))),pin);
});
