// Offline Yoga hides the financial exchange service, not student/research
// exchange terminology in immutable approved visa articles.
import assert from 'node:assert/strict';
const financial=/обмен(?:а|е|ом|у)?\s+валют|(?:currency|money|cash) exchange|exchang(?:e|ing) (?:cash|money)|currency assistance|cash delivery|\/exchange(?:\/|[?#"'])/i;
const educational=/обменным образовательным программам|обменных программ|исследовательского обмена|академический обмен|\bexchange programmes\b/gi;
const excluded=/обмен|\bexchange\b(?! rate)|currency assistance|cash delivery|Exchanging cash/i;
// Exact immutable SKTT document-transfer safety sentence, not a service grant.
const documentTransfer='Полные документы передавайте после согласования безопасного способа обмена.';
export function assertNoYogaFinancialExchange(html,label='Yoga preview') {
  assert.equal(typeof html,'string');
  assert.ok(!financial.test(html)&&!excluded.test(html.replace(educational,'').replaceAll(documentTransfer,'')),
    'Excluded exchange topic leaked into Yoga: '+label);
}
