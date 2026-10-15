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
