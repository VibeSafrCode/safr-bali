// Founder-authorized Yoga presentation policy only. Canonical SAFRWAY content,
// service identities, visa terms, prices and exchange-rate calculations are not edited.
export const YOGA_CONTENT_POLICY='YOGA_HIDE_EXCHANGE_2026_10_09';

export function yogaRouteAllowed(route) {
  return typeof route==='string'&&!/(?:^|\/)exchange(?:\/|$)/i.test(route.split(/[?#]/)[0]);
}

const copyCuts=[
  [', обмен валюты',''],[', currency exchange',''],
  ['Обмен, визовые вопросы','Визовые вопросы'],['Exchange, visa matters','Visa matters'],
  ['обмен или доставку наличных, ',''],['exchange or cash delivery, ',''],
  [', обмен и помощь', ' и помощь'],[', exchange and help',' and help'],
];

export function yogaOverviewCopy(text) {
  return copyCuts.reduce((value,[from,to])=>value.replaceAll(from,to),text);
}

export function yogaPublicPage(page) {
  if(!yogaRouteAllowed(page.route))throw new Error('Excluded Yoga service route');
  return {...page,
    description:yogaOverviewCopy(page.description),lead:yogaOverviewCopy(page.lead),body:yogaOverviewCopy(page.body),
    cards:page.cards.filter(card=>yogaRouteAllowed(card.href)).map(card=>({...card,
      summary:yogaOverviewCopy(card.summary),...(card.note?{note:yogaOverviewCopy(card.note)}:{}),
    })),
    relatedRoutes:page.relatedRoutes.filter(link=>yogaRouteAllowed(link.href)),
    breadcrumbs:page.breadcrumbs.filter(link=>yogaRouteAllowed(link.href)),
  };
}

// Only these three arrival pages contain ancillary exchange-service copy.
// Format-aware cuts remove that topic; they do not rewrite translations or
// remove unrelated uses of "currency" (income requirements or IDR/USD pricing).
const arrivalPages=new Set(['voa','knowledge_evoa_online','knowledge_evoa_vs_voa']);
export function yogaRegistrySections(sections,contentId) {
  if(!arrivalPages.has(contentId))return sections;
  return sections.map(section=>({...section,html:section.html
    .replace(/<h3>(?:Можно ли заранее решить вопрос с валютой\?|Can you arrange currency exchange in advance\?)<\/h3><p>[\s\S]*?<\/p>/g,'')
    .replace(/<li><p>(?:при необходимости помочь с обменом валюты|при необходимости помощь с обменом валюты|помощь с обменом валюты|help arrange currency exchange|currency assistance)[^<]*<\/p><\/li>/g,'')
    .replace(/<p>Если для оплаты или первых расходов вам дополнительно нужно менять наличную валюту в аэропорту,[^<]*<\/p>/g,'')
    .replace(/<p>При необходимости обменять наличные в аэропорту[^<]*<\/p>/g,'')
    .replace(' If you also need to exchange cash for payment or initial expenses, that adds another stop; airport exchange rates are not always the most favorable.','')
    .replace(', искать транспорт и срочно менять деньги в первой попавшейся точке',' или искать транспорт')
    .replace(', find transport or urgently exchange money at the first counter after landing',' or find transport')
    .replace(' → при необходимости обмен валюты.','.')
    .replace(' → currency assistance if needed.','.')
    .replace('Заранее организуем трансфер и помогаем решить вопрос с валютой.','Заранее организуем трансфер.')
    .replace('We can also arrange transfer and currency assistance.','We can also arrange transfer.')
    .replace(' If needed, we can help with exchange at a more favorable rate than at the airport.','')
    .replace('получить местную валюту, ','')
    .replace('currency exchange, ','')
    .replace('Exchanging cash adds another stop, and airport rates are not always the most favorable. ','')
  }));
}
