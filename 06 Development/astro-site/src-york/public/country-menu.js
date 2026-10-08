/** Native details/summary supplies Enter/Space/Tab behavior even without JS.
 * The optional enhancement never submits, navigates or stores anything. */
export function initCountryMenus(doc) {
  const menus=[...doc.querySelectorAll('[data-country-menu]')];
  const outside=event=>{
    for(const menu of menus)if(menu.open&&!menu.contains(event.target))menu.open=false;
  };
  const escape=event=>{
    if(event.key!=='Escape')return;
    const menu=menus.find(candidate=>candidate.open);
    if(!menu)return;
    for(const candidate of menus)candidate.open=false;
    menu.querySelector('summary')?.focus();
    event.preventDefault();
  };
  doc.addEventListener('pointerdown',outside);
  doc.addEventListener('keydown',escape);
  return ()=>{doc.removeEventListener('pointerdown',outside);doc.removeEventListener('keydown',escape);};
}

if(typeof document!=='undefined')initCountryMenus(document);
