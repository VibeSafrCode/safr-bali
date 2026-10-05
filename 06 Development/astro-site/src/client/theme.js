const themeKey='safrway:appearance';
const valid=value=>['auto','light','dark'].includes(value)?value:'auto';
let preference='auto';
try{preference=valid(localStorage.getItem(themeKey));}catch{}
const dark=window.matchMedia?.('(prefers-color-scheme: dark)');
const light=window.matchMedia?.('(prefers-color-scheme: light)');
function automaticTheme(){
 if(dark?.matches)return 'dark';
 if(light?.matches)return 'light';
 const hour=new Date().getHours();return hour>=7&&hour<19?'light':'dark';
}
function applyTheme(){
 const selected=preference==='auto'?automaticTheme():preference;
 document.documentElement.dataset.theme=selected;
 document.documentElement.dataset.themePreference=preference;
 document.querySelectorAll('[data-theme-toggle]').forEach(button=>{
  const en=(document.documentElement.dataset.uiLocale??document.documentElement.lang)==='en';
  const names=en?{auto:'Automatic',light:'Light',dark:'Dark'}:{auto:'Авто',light:'Светлая',dark:'Тёмная'};
  const next={auto:'light',light:'dark',dark:'auto'}[preference];
  button.title=en?`Theme: ${names[preference]}. Switch to ${names[next]}`:`Тема: ${names[preference]}. Переключить на «${names[next]}»`;
  button.setAttribute('aria-label',button.title);
 });
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',selected==='dark'?'#0b1914':'#f5f2ea');
 document.querySelectorAll('[data-theme-mode]').forEach(select=>{select.value=preference;});
 document.querySelectorAll('[data-public-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.publicThemeChoice===preference)));
}
function choose(value){preference=valid(value);try{localStorage.setItem(themeKey,preference);}catch{}applyTheme();}
document.querySelectorAll('[data-theme-toggle]').forEach(button=>button.addEventListener('click',()=>choose({auto:'light',light:'dark',dark:'auto'}[preference])));
document.querySelectorAll('[data-theme-mode]').forEach(select=>select.addEventListener('change',()=>choose(select.value)));
document.querySelectorAll('[data-public-theme-choice]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.publicThemeChoice)));
dark?.addEventListener('change',applyTheme);light?.addEventListener('change',applyTheme);
window.addEventListener('storage',event=>{if(event.key===themeKey||event.key===null){preference=valid(event.newValue);applyTheme();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)applyTheme();});
setInterval(()=>{if(preference==='auto'&&!document.hidden&&!dark?.matches&&!light?.matches)applyTheme();},60000);
applyTheme();
