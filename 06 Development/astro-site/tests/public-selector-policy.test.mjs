import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGE_OPTIONS,COUNTRY_CODES,normalizeLanguage,safePublicPath,completeLanguageChoices,languageDecision,countryChoices} from '../src/client/public-selector-policy.mjs';

test('manual preference has priority; language hints never redirect an explicit URL',()=>{
  assert.deepEqual(languageDecision({saved:'de',telegram:'ar',browser:['en-US'],current:'ru',explicitUrl:true}),{code:'de',source:'manual',prompt:false,redirect:false});
  assert.equal(languageDecision({telegram:'ar',browser:['en-US'],current:'ar'}).source,'telegram');
  assert.equal(languageDecision({browser:['xx','ja-JP'],current:'ja'}).code,'ja');
  assert.equal(languageDecision({browser:['xx'],current:'ru'}).prompt,true);
  assert.equal(languageDecision({browser:['xx'],current:'ru',prompted:true}).prompt,false);
  assert.equal(languageDecision({browser:['de-DE'],current:'ru'}).prompt,true);
  assert.equal(normalizeLanguage('zh-Hant-TW'),null);
  assert.equal(normalizeLanguage('zh_CN'),'zh-Hans');
  assert.equal(languageDecision({browser:['en-US'],current:'ru',available:['ru','en']}).redirect,true);
  assert.equal(languageDecision({browser:['de-DE'],current:'ru',available:['ru','en']}).redirect,false);
  assert.equal(languageDecision({saved:'en',current:'ru',explicitUrl:true,available:['ru','en']}).redirect,false);
});

test('all 10 choices are visible, but only supplied public routes become links',()=>{
  const choices=completeLanguageChoices([{code:'ru',short:'RU',label:'Русский',href:'/bali/visas/c1/'},{code:'en',short:'EN',label:'English',href:'/en/bali/visas/c1/'}]);
  assert.equal(choices.length,10);
  assert.equal(choices.filter(choice=>choice.href).length,2);
  assert.equal(choices.find(choice=>choice.code==='ar').href,null);
  const fullyConnected=completeLanguageChoices(LANGUAGE_OPTIONS.map(option=>({...option,href:option.code==='ru'?'/bali/visas/c1/':`/${option.code.toLowerCase()}/bali/visas/c1/`} )));
  assert.equal(fullyConnected.filter(choice=>choice.href).length,10);
  for(const unsafe of ['https://example.com/','//example.com/','/_registry/c1/','/api/web/','/admin/','/bali/?locale=ar','/bali/#hello','/../en/','/bali/%2f/'])assert.equal(safePublicPath(unsafe),null);
  assert.equal(completeLanguageChoices([{code:'ru',href:'/'},{code:'ru',href:'/en/'}]).find(choice=>choice.code==='ru').href,null);
});

test('full country inventory is separate from existing country routes and homepage cards',()=>{
  assert.equal(COUNTRY_CODES.length,249);
  assert.equal(new Set(COUNTRY_CODES).size,249);
  const ru=countryChoices('ru','ru'),en=countryChoices('en','en'),de=countryChoices('en','de');
  assert.equal(ru.length,249);
  assert.equal(ru.filter(country=>country.href).length,5);
  assert.equal(ru.find(country=>country.code==='ID').href,'/bali/');
  assert.equal(en.find(country=>country.code==='AE').href,'/en/uae/');
  assert.equal(ru.find(country=>country.code==='VN').href,null);
  assert.equal(de.some(country=>country.href),false);
  assert.equal(ru.every(country=>country.href===null||safePublicPath(country.href)),true);
});
