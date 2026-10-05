// Customer-facing qualification required by final Founder decision 2.
// Presentation only: accepted article bodies, source revisions and translations
// are immutable. General category labels do not prove an individual route.
const notes = Object.freeze({
  ru:'Семейное оформление не происходит автоматически. Применимость E31B, E31E и E31H проверяется отдельно по основному разрешению на пребывание и действующим правилам. E33G на один год и многолетняя Golden Visa — не взаимозаменяемые основания. До оплаты менеджер подтвердит маршрут для каждого члена семьи.',
  en:'Family applications are not automatic. E31B, E31E and E31H eligibility must be checked separately against the principal residence permit and current rules. One-year E33G and multi-year Golden Visa are not interchangeable grounds. Before payment, a manager will confirm the route for each family member.',
  de:'Familienanträge erfolgen nicht automatisch. Die Anwendbarkeit von E31B, E31E und E31H wird anhand des Aufenthaltstitels der Hauptperson und der geltenden Regeln gesondert geprüft. Einjähriges E33G und mehrjährige Golden Visa sind keine austauschbaren Grundlagen. Vor der Zahlung bestätigt ein Manager den Weg für jedes Familienmitglied.',
  fr:'La demande familiale n’est pas automatique. L’applicabilité des catégories E31B, E31E et E31H doit être vérifiée séparément selon le titre de séjour principal et les règles en vigueur. L’E33G d’un an et la Golden Visa pluriannuelle ne sont pas des bases interchangeables. Avant le paiement, un manager confirme le parcours de chaque membre de la famille.',
  es:'La solicitud familiar no es automática. La aplicabilidad de E31B, E31E y E31H se verifica por separado según el permiso de residencia principal y las normas vigentes. E33G de un año y Golden Visa de varios años no son bases intercambiables. Antes del pago, un gestor confirma la vía para cada familiar.',
  'zh-Hans':'家庭申请不会自动办理。E31B、E31E 和 E31H 是否适用，须根据主申请人的居留许可及现行规定逐一核实。一年期 E33G 与多年期 Golden Visa 不能作为可互换的申请依据。付款前，经理会确认每位家庭成员的申请途径。',
  ja:'家族の申請は自動ではありません。E31B、E31E、E31H の適用可否は、主申請者の滞在許可と現行規則に基づき個別に確認します。1年間の E33G と複数年の Golden Visa は同じ申請根拠として扱えません。お支払い前に担当者が各家族の申請方法を確認します。',
  ko:'가족 신청은 자동으로 진행되지 않습니다. E31B, E31E, E31H 적용 여부는 주 신청자의 체류 허가와 현행 규정에 따라 개별적으로 확인해야 합니다. 1년 E33G와 다년 Golden Visa는 동일한 신청 근거로 취급할 수 없습니다. 결제 전에 담당자가 가족 구성원별 신청 경로를 확인합니다.',
  hi:'परिवार के आवेदन अपने-आप नहीं होते। E31B, E31E और E31H की पात्रता मुख्य आवेदक के निवास परमिट और मौजूदा नियमों के आधार पर अलग से जाँची जाती है। एक साल का E33G और कई साल की Golden Visa एक-दूसरे के बदले इस्तेमाल किए जाने वाले आधार नहीं हैं। भुगतान से पहले मैनेजर हर परिवार सदस्य का आवेदन मार्ग पुष्टि करेगा।',
  ar:'طلبات أفراد الأسرة ليست تلقائية. يجب التحقق بشكل منفصل من انطباق E31B وE31E وE31H وفق تصريح إقامة صاحب الطلب الأساسي والقواعد الحالية. E33G لمدة سنة وGolden Visa لعدة سنوات ليسا أساسين قابلين للتبادل. قبل الدفع، يؤكد المدير مسار كل فرد من الأسرة.',
});
export function familyApplicabilityNote(contentId,locale){
  return ['e33g','knowledge_e33g_family'].includes(contentId)?notes[locale]??notes.en:null;
}
