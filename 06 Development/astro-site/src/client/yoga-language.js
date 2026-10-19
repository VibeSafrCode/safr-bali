const navigation=document.querySelector('[data-yoga-languages]');
if(navigation instanceof HTMLElement){
  const key='yoga:public-locale:v1';
  let choiceGeneration=0;
  navigation.addEventListener('click',event=>{
    if(!(event.target instanceof Element))return;
    const link=event.target.closest('a[data-yoga-language]');
    if(!(link instanceof HTMLAnchorElement)||!['ru','en'].includes(link.dataset.yogaLanguage))return;
    choiceGeneration++;
    try{localStorage.setItem(key,link.dataset.yogaLanguage);}catch{}
  },true);
  const loadChoice=choiceGeneration;
  const {languageDecision,YOGA_UI_LOCALES}=await import(navigation.dataset.policyModule);
  let saved=null;
  try{saved=localStorage.getItem(key);}catch{}
  const links=[...navigation.querySelectorAll('a[data-yoga-language]')];
  const decision=languageDecision({saved,allowed:YOGA_UI_LOCALES,
    browser:navigator.languages?.length?[...navigator.languages]:[navigator.language],
    current:navigation.dataset.currentLanguage,explicitUrl:navigation.dataset.explicitLanguage==='true',
    available:links.map(link=>link.dataset.yogaLanguage)});
  if(decision.redirect&&choiceGeneration===loadChoice){
    const target=links.find(link=>link.dataset.yogaLanguage===decision.code);
    if(target instanceof HTMLAnchorElement&&target.origin===location.origin)location.replace(target.href);
  }
}
