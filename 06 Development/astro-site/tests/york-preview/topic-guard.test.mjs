import assert from 'node:assert/strict';
import test from 'node:test';
import {assertNoYogaFinancialExchange} from '../../scripts/yoga-preview-topic-guard.mjs';
test('exact approved educational exchange wording and the existing exchange-rate explanation survive',()=>{
  for(const text of ['академический обмен','для обменных программ',
    'относится к обменным образовательным программам','исследовательского обмена',
    'intended for exchange programmes','educational exchange programmes','exchange rate'])
    assert.doesNotThrow(()=>assertNoYogaFinancialExchange('<p>'+text+'</p>'));
});
test('financial service routes, marketing and educational-word camouflage remain blocked',()=>{
  for(const text of ['Обмен','обмен валюты','с обменом валюты','currency exchange',
    'exchange money','exchange cash','cash delivery','currency assistance','Exchanging cash',
    '<a href="/bali/exchange/">Service</a>',
    'академический обмен валюты','currency exchange programmes','money exchange programmes',
    'cash exchange programmes','exchange programmes and cash delivery'])
    assert.throws(()=>assertNoYogaFinancialExchange(text),/Excluded exchange topic/);
});
test('exact approved SKTT document-transfer sentence survives in body and structured data',()=>{
  const sentence='Полные документы передавайте после согласования безопасного способа обмена.';
  assert.doesNotThrow(()=>assertNoYogaFinancialExchange('<p>'+sentence+'</p><script type="application/ld+json">'+JSON.stringify({text:sentence})+'</script>'));
});
test('document-transfer sentence cannot camouflage a financial route or altered exchange wording',()=>{
  const sentence='Полные документы передавайте после согласования безопасного способа обмена.';
  for(const text of [sentence+' обмен валюты',sentence+' currency exchange',sentence+'<a href="/bali/exchange/">Service</a>',sentence.replace('обмена.','обмена валюты.'),sentence.replace('обмена.','обмена.'+' Обмен'),sentence.toLowerCase()])
    assert.throws(()=>assertNoYogaFinancialExchange(text),/Excluded exchange topic/);
});
