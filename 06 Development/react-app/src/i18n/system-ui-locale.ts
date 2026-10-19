import {MAIN_UI_LOCALES,explicitUiLocaleFromPath,resolveUiLocale,type UiLocale} from '../../../shared/src/ui-locale-policy.mjs';

/** Browser adapter only. Template document.lang and Telegram contact hints are
 * not evidence of a language route or an explicit UI choice. SSR defaults EN. */
export function browserUiInitialLocale(allowed:readonly UiLocale[]=MAIN_UI_LOCALES){
  let browser:readonly string[]=[],path:unknown;
  try{if(typeof navigator!=='undefined')browser=navigator.languages?.length?navigator.languages:[navigator.language];}catch{}
  try{if(typeof window!=='undefined')path=window.location?.pathname;}catch{}
  return resolveUiLocale({allowed,route:explicitUiLocaleFromPath(path,allowed),browser});
}
