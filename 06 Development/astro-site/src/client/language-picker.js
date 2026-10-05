const trigger = document.querySelector('[data-language-picker-open]');
const dialog = document.querySelector('#site-language-dialog');
if (trigger instanceof HTMLButtonElement && dialog instanceof HTMLDialogElement) {
  // The component supplies the same-origin emitted module URL. Raw ?url assets
  // must not retain relative source imports after the production build.
  const {LANGUAGE_PREFERENCE_KEY,LANGUAGE_PROMPT_KEY,languageDecision} = await import(dialog.dataset.policyModule);
  let previousOverflow = '';
  const position = () => {
    if (matchMedia('(max-width:699px)').matches) return;
    const box = trigger.getBoundingClientRect();
    dialog.style.top = `${Math.max(16,Math.min(box.bottom + 12,innerHeight - dialog.offsetHeight - 16))}px`;
    dialog.style.right = `${Math.max(16, innerWidth - box.right)}px`;
  };
  const open = () => {
    if (dialog.open) return;
    document.querySelector('[data-menu-toggle]')?.setAttribute('aria-expanded','false');
    document.querySelector('.site-header')?.removeAttribute('data-menu-open');
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal(); position();
    trigger.setAttribute('aria-expanded','true');
    try { sessionStorage.setItem(LANGUAGE_PROMPT_KEY,'1'); } catch {}
  };
  const close = () => { if (dialog.open) dialog.close(); };
  trigger.addEventListener('click',open);
  dialog.querySelector('[data-language-picker-close]')?.addEventListener('click',close);
  dialog.addEventListener('close',() => {
    document.body.style.overflow = previousOverflow;
    trigger.setAttribute('aria-expanded','false');
    trigger.focus({preventScroll:true});
  });
  dialog.addEventListener('click',event => {
    if (!(event.target instanceof Element)) return;
    const choice = event.target.closest('[data-language-choice]');
    if (choice) {
      const code = choice.getAttribute('data-language-choice');
      try { localStorage.setItem(LANGUAGE_PREFERENCE_KEY,code); } catch {}
      close(); return;
    }
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  });
  addEventListener('resize',() => { if (dialog.open) position(); });
  let saved = null, prompted = false;
  try { saved = localStorage.getItem(LANGUAGE_PREFERENCE_KEY); } catch {}
  try { prompted = sessionStorage.getItem(LANGUAGE_PROMPT_KEY) === '1'; } catch {}
  const decision = languageDecision({saved,telegram:window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code,
    browser:navigator.languages?.length ? [...navigator.languages] : [navigator.language],
    current:dialog.dataset.currentLanguage,explicitUrl:dialog.dataset.explicitLanguage === 'true',prompted,
    available:[...dialog.querySelectorAll('a[data-language-choice]')].map(a=>a.dataset.languageChoice)});
  if (decision.code) {
    dialog.querySelector(`[data-language-choice="${decision.code}"]`)?.setAttribute('data-language-recommended','true');
  }
  if(decision.redirect){
    const choice=dialog.querySelector(`a[data-language-choice="${decision.code}"]`);
    if(choice instanceof HTMLAnchorElement && choice.origin===location.origin){location.replace(choice.href);}
  }
  if (decision.prompt) open();
}
