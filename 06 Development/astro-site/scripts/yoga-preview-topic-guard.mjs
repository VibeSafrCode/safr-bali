// Offline Yoga hides the financial exchange service, not student/research
// exchange terminology in immutable approved visa articles.
import assert from 'node:assert/strict';
const financial=/обмен(?:а|е|ом|у)?\s+валют|(?:currency|money|cash) exchange|exchang(?:e|ing) (?:cash|money)|currency assistance|cash delivery|\/exchange(?:\/|[?#"'])/i;
const educational=/обменным образовательным программам|обменных программ|исследовательского обмена|академический обмен|\bexchange programmes\b/gi;
const excluded=/обмен|\bexchange\b(?! rate)|currency assistance|cash delivery|Exchanging cash/i;
export function assertNoYogaFinancialExchange(html,label='Yoga preview') {
  assert.equal(typeof html,'string');
  assert.ok(!financial.test(html)&&!excluded.test(html.replace(educational,'')),
    'Excluded exchange topic leaked into Yoga: '+label);
}
