import assert from 'node:assert/strict';
import test from 'node:test';
import {BANK_SOURCE_SPANS,BANK_PACKETS,BANK_LOCALES,parseBankDraftPage,extractBankDraftCorpus,planBankEditorialImport} from '../scripts/bank-editorial-source.mjs';

function fixture(locale='en'){
  const button=BANK_SOURCE_SPANS.find(row=>row.locale===locale).button;
  return {seo:['**Title:** Synthetic source title  ','**Description:** Synthetic source description'],body:[
    '# Synthetic source H1','','First literal intro.','','Second literal intro.','','## First section','','First paragraph.','','Second paragraph.','',
    '## Second section','','Third paragraph.','','Fourth paragraph.','','## Third section','','Quoted cost, no number.','',
    '**A complete question?**  ','A complete literal answer.','','**'+button+'** Contact using the existing flow']};
}
for(const locale of BANK_LOCALES)test('literal bank format and supplied CTA: '+locale,()=>{
  const f=fixture(locale),page=parseBankDraftPage(f.seo,f.body,{locale});
  assert.equal(page.bodyMarkdown,f.body.slice(0,25).join('\n')+'\n');
  assert.ok(page.bodyMarkdown.includes('**A complete question?**  \n'));
  assert.ok(!page.bodyMarkdown.includes(f.body[25]));
  assert.deepEqual(page.faq,[{question:'A complete question?',answerMarkdown:'A complete literal answer.'}]);
  assert.equal(page.cta[0].label,'Contact using the existing flow');
  assert.equal(page.directAnswer,'');assert.equal(page.factBlock,null);assert.equal(page.faqHeading,null);
  assert.equal(page.seo.title,'Synthetic source title');
});
for(const mutate of [
  f=>f.body.pop(), f=>f.body.push('Extra customer tail'), f=>f.body[22]='**A complete question?**',
  f=>f.body[22]='**A complete question?**\u00a0\u00a0', f=>f.body[23]='', f=>f.body[25]='**Button:** ',
  f=>f.body[6]='##', f=>f.body[2]='## Replaced intro', f=>f.body[24]='Hidden tail',
  f=>f.seo[0]='**Title:** Uncaptured layout', f=>f.seo[1]='**Description:** ',
  f=>f.body[14]='Unsafe\u0000scalar', f=>f.body[14]='Lone\ud800surrogate', f=>f.body[14]={toString(){throw Error('Do not coerce');}},
])test('rejects missing/foreign/normalized source shape '+String(mutate),()=>{
  const f=fixture();mutate(f);assert.throws(()=>parseBankDraftPage(f.seo,f.body,{locale:'en'}));
});
test('unknown locale and mutable allowlists are refused',()=>{
  const f=fixture();assert.throws(()=>parseBankDraftPage(f.seo,f.body,{locale:'zz'}));
  assert.throws(()=>BANK_LOCALES.push('zz'));assert.throws(()=>BANK_SOURCE_SPANS[0].locale='zz');
  assert.throws(()=>BANK_PACKETS[0].sha256='a'.repeat(64));
});
test('raw corpus requires the exact four pinned archives, never self-rehashed substitutes',()=>{
  assert.throws(()=>extractBankDraftCorpus(new Map()));
  assert.throws(()=>extractBankDraftCorpus(new Map(BANK_PACKETS.map(pin=>[pin.task,Buffer.alloc(pin.bytes)]))),/hash drift/);
  assert.throws(()=>extractBankDraftCorpus(new Map(BANK_PACKETS.map(pin=>[pin.task,'not byte input']))));
  assert.throws(()=>extractBankDraftCorpus(new Map([...BANK_PACKETS.map(pin=>[pin.task,Buffer.alloc(pin.bytes)]),['extra',Buffer.alloc(0)]])));
});
test('foreign, missing or changed Registry record cannot be replaced',()=>{
  assert.throws(()=>planBankEditorialImport({records:[],locales:[]},new Map()));
  assert.throws(()=>planBankEditorialImport({records:[{contentId:'bank',serviceId:'invented'}],locales:[]},new Map()),/record drift/);
});
