/** Native details remain usable without JS. Enhancement is local-only. */
export function initCountryMenus(doc) {
  const menus=[...doc.querySelectorAll('[data-country-menu]')];
  const cleanup=[];
  const timers=new Map();
  const view=doc.defaultView;
  const cancel=menu=>{clearTimeout(timers.get(menu));timers.delete(menu);};
  const close=menu=>{cancel(menu);menu.open=false;for(const child of menu.querySelectorAll?.('details[open]')??[]){cancel(child);child.open=false;}};
  const siblings=(a,b)=>a.parentElement===b.parentElement;
  const open=menu=>{for(const other of menus)if(other!==menu&&siblings(other,menu))close(other);menu.open=true;};
  const listen=(target,type,handler)=>{if(!target?.addEventListener)return;target.addEventListener(type,handler);cleanup.push(()=>target.removeEventListener(type,handler));};
  const header=doc.querySelector?.('[data-site-header]');
  const toggle=header?.querySelector('[data-nav-toggle]');
  const nav=header?.querySelector('.main-navigation');
  const closeNav=()=>{header?.removeAttribute('data-nav-open');toggle?.setAttribute('aria-expanded','false');for(const menu of menus)close(menu);};
  if(header&&toggle&&nav){
    header.setAttribute('data-nav-ready','');
    listen(toggle,'click',()=>{
      const expanded=toggle.getAttribute('aria-expanded')==='true';
      if(expanded)closeNav();else{header.setAttribute('data-nav-open','');toggle.setAttribute('aria-expanded','true');}
    });
    listen(nav,'click',event=>{if(event.target.closest?.('a'))closeNav();});
    listen(header,'focusout',event=>{if(!header.contains(event.relatedTarget))closeNav();});
    const desktop=view?.matchMedia('(min-width: 901px)');
    listen(desktop,'change',()=>closeNav());
  }
  for(const menu of menus){
    listen(menu,'pointerenter',event=>{
      cancel(menu);
      if(event.pointerType==='mouse'&&view?.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 901px)').matches)open(menu);
    });
    listen(menu,'pointerleave',event=>{
      if(event.pointerType!=='mouse'||menu.contains(doc.activeElement))return;
      cancel(menu);timers.set(menu,setTimeout(()=>{if(!menu.contains(doc.activeElement))close(menu);},180));
    });
    listen(menu,'toggle',()=>{if(menu.open)for(const other of menus)if(other!==menu&&siblings(other,menu))close(other);});
    listen(menu,'focusout',event=>{if(!menu.contains(event.relatedTarget))close(menu);});
  }
  const outside=event=>{
    for(const menu of menus)if(menu.open&&!menu.contains(event.target))close(menu);
    if(header&&!header.contains(event.target))closeNav();
  };
  const escape=event=>{
    if(event.key!=='Escape')return;
    const menu=[...menus].reverse().find(candidate=>candidate.open);
    if(menu){close(menu);menu.querySelector('summary')?.focus();event.preventDefault();}
    else if(toggle?.getAttribute('aria-expanded')==='true'){closeNav();toggle.focus();event.preventDefault();}
  };
  listen(doc,'pointerdown',outside);listen(doc,'keydown',escape);
  return ()=>{for(const menu of menus)cancel(menu);cleanup.forEach(dispose=>dispose());};
}
if(typeof document!=='undefined')initCountryMenus(document);
