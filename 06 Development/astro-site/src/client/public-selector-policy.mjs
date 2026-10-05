// UI hints only. Locale and country selection never grants access or invents a route.
export const LANGUAGE_PREFERENCE_KEY = 'safr:public-locale:v1';
export const LANGUAGE_PROMPT_KEY = 'safr:language-prompt:v2';
export const LANGUAGE_OPTIONS = Object.freeze([
  {code:'ru',short:'RU',label:'Русский'}, {code:'en',short:'EN',label:'English'},
  {code:'zh-Hans',short:'中文',label:'简体中文'}, {code:'ko',short:'KO',label:'한국어'},
  {code:'fr',short:'FR',label:'Français'}, {code:'de',short:'DE',label:'Deutsch'},
  {code:'ja',short:'JA',label:'日本語'}, {code:'hi',short:'HI',label:'हिन्दी'},
  {code:'es',short:'ES',label:'Español'}, {code:'ar',short:'AR',label:'العربية'},
]);

export function normalizeLanguage(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().replaceAll('_','-').toLowerCase();
  if (/^zh(?:-|$)/.test(code)) {
    return /(?:hant|tw|hk|mo)(?:-|$)/.test(code) ? null : 'zh-Hans';
  }
  return LANGUAGE_OPTIONS.find(option => option.code === code.split('-')[0])?.code ?? null;
}

export function safePublicPath(value) {
  if (typeof value !== 'string' || !/^\/(?:[a-zA-Z0-9-]+\/)*$/.test(value)) return null;
  if (/^\/(?:api|admin|account|mini-app)(?:\/|$)/.test(value)) return null;
  return value;
}

export function completeLanguageChoices(input = []) {
  return LANGUAGE_OPTIONS.map(option => {
    const matches = input.filter(choice => choice?.code === option.code);
    const candidate = matches.length === 1 ? matches[0] : null;
    return {...option,short:candidate?.short || option.short,label:candidate?.label || option.label,
      href:safePublicPath(candidate?.href)};
  });
}

export function languageDecision({saved, telegram, browser = [], current = 'ru', explicitUrl = false, prompted = false, available = []} = {}) {
  const manual = normalizeLanguage(saved);
  const telegramHint = normalizeLanguage(telegram);
  const browserHint = browser.map(normalizeLanguage).find(Boolean) ?? null;
  const code = manual ?? telegramHint ?? browserHint;
  const source = manual ? 'manual' : telegramHint ? 'telegram' : browserHint ? 'browser' : 'unknown';
  // Only an unqualified entry page may select a known, actually available
  // translation automatically. Explicit deep links remain authoritative.
  const redirect = Boolean(!explicitUrl && code && code !== current && available.includes(code));
  const prompt = !prompted && (!code || (!explicitUrl && code !== current && !redirect));
  return {code, source, prompt, redirect};
}

// ISO 3166-1 alpha-2 countries/territories, separate from featured destinations.
export const COUNTRY_CODES = Object.freeze(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '));
export const EXISTING_COUNTRY_DESTINATIONS = Object.freeze({ID:'bali', TH:'thailand', RU:'russia', NP:'nepal', AE:'uae'});

export function countryChoices(locale = 'ru', articleLocale = locale) {
  const names = new Intl.DisplayNames([locale], {type:'region'});
  const english = new Intl.DisplayNames(['en'], {type:'region'});
  const hasCountryLocale = articleLocale === 'ru' || articleLocale === 'en';
  return COUNTRY_CODES.map(code => {
    const destination = EXISTING_COUNTRY_DESTINATIONS[code] ?? null;
    const label = (names.of(code) ?? code) + (code === 'ID' ? ' · ' + (locale === 'en' ? 'Bali' : 'Бали') : '');
    const href = destination && hasCountryLocale ? `${articleLocale === 'en' ? '/en' : ''}/${destination}/` : null;
    return {code,label,search:`${label} ${english.of(code) ?? ''} ${code}`,href,destination};
  }).sort((a,b) => Number(Boolean(b.href)) - Number(Boolean(a.href)) || a.label.localeCompare(b.label,locale) || a.code.localeCompare(b.code));
}
