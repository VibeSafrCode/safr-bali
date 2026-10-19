// Pure UI policy only. No DOM, storage, Telegram, dictionaries or identity.
export const MAIN_UI_LOCALES=Object.freeze(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);
export const YOGA_UI_LOCALES=Object.freeze(['ru','en']);
export const LANGUAGE_PREFERENCE_KEY='safr:public-locale:v1';
export const LANGUAGE_PROMPT_KEY='safr:language-prompt:v2';

export function normalizeLanguage(value){
  if(typeof value!=='string')return null;
  const code=value.trim().replaceAll('_','-').toLowerCase();
  if(!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code))return null;
  if(/^zh(?:-|$)/.test(code))return /(?:hant|tw|hk|mo)(?:-|$)/.test(code)?null:'zh-Hans';
  return MAIN_UI_LOCALES.find(locale=>locale===code.split('-')[0])??null;
}

export function resolveUiLocale({allowed=MAIN_UI_LOCALES,route,saved,browser=[]}={}){
  if(!Array.isArray(allowed)||!allowed.includes('en')||new Set(allowed).size!==allowed.length||
    allowed.some(locale=>!MAIN_UI_LOCALES.includes(locale)))throw Error('UI_LOCALE_ALLOWLIST_INVALID');
  if(allowed.includes(route))return {locale:route,source:'route'};
  if(allowed.includes(saved))return {locale:saved,source:'cached'};
  for(const value of Array.isArray(browser)?browser:[]){
    const locale=normalizeLanguage(value);
    if(locale&&allowed.includes(locale))return {locale,source:'automatic'};
  }
  return {locale:'en',source:'automatic'};
}

export function explicitUiLocaleFromPath(path,allowed=MAIN_UI_LOCALES){
  if(typeof path!=='string')return null;
  const prefix=path.match(/^\/(en|zh-cn|ko|fr|de|ja|hi|es|ar)(?:\/|$)/)?.[1];
  const locale=prefix==='zh-cn'?'zh-Hans':prefix;
  return allowed.includes(locale)?locale:null;
}

export function languageDecision({saved,browser=[],current='ru',explicitUrl=false,prompted=false,available=[],allowed=MAIN_UI_LOCALES}={}){
  const choice=resolveUiLocale({allowed,saved:normalizeLanguage(saved),browser});
  const browserHint=(Array.isArray(browser)?browser:[]).map(normalizeLanguage).find(code=>allowed.includes(code));
  const source=choice.source==='cached'?'manual':browserHint?'browser':'fallback';
  const code=choice.locale;
  // Only supplied, existing same-site translations may be selected by an entry
  // adapter. A concrete URL is authoritative even when fallback is English.
  const redirect=Boolean(!explicitUrl&&code!==current&&available.includes(code));
  const prompt=Boolean(!prompted&&!explicitUrl&&code!==current&&!redirect);
  return {code,source,prompt,redirect};
}
