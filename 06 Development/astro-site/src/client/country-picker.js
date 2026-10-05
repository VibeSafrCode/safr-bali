const trigger = document.querySelector('[data-country-picker-open]');
const dialog = document.querySelector('[data-country-picker]');
if (trigger instanceof HTMLButtonElement && dialog instanceof HTMLDialogElement) {
  const search = dialog.querySelector('[data-country-search]');
  const rows = [...dialog.querySelectorAll('[data-country-row]')];
  const assessment = dialog.querySelector('[data-country-assessment]');
  const contact = dialog.querySelector('[data-country-contact]');
  let previousOverflow = '';
  const normalize = value => value.normalize('NFKD').toLocaleLowerCase().trim();
  const position = () => {
    if (matchMedia('(max-width:699px)').matches) return;
    const box = trigger.getBoundingClientRect();
    dialog.style.top = `${Math.max(16,Math.min(box.bottom + 12,innerHeight - dialog.offsetHeight - 16))}px`;
    dialog.style.left = `${Math.max(16,Math.min(box.left,innerWidth - dialog.offsetWidth - 16))}px`;
  };
  trigger.addEventListener('click',() => {
    if (dialog.open) return;
    document.querySelector('[data-menu-toggle]')?.setAttribute('aria-expanded','false');
    document.querySelector('.site-header')?.removeAttribute('data-menu-open');
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal(); position();
    trigger.setAttribute('aria-expanded','true');
    search?.focus({preventScroll:true});
  });
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.querySelector('[data-country-close]')?.addEventListener('click',close);
  dialog.addEventListener('close',() => {
    document.body.style.overflow = previousOverflow;
    trigger.setAttribute('aria-expanded','false');
    const focus = trigger.getClientRects().length ? trigger : document.querySelector('[data-menu-toggle]');
    focus?.focus({preventScroll:true});
  });
  search?.addEventListener('input',() => {
    const query = normalize(search.value);
    let count = 0;
    rows.forEach(row => { row.hidden = !normalize(row.dataset.countrySearchText).includes(query); if (!row.hidden) count++; });
    dialog.querySelector('[data-country-empty]').hidden = count > 0;
  });
  // Capture closes the country modal before the existing support button handler.
  dialog.addEventListener('click',event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-country-contact]')) { close(); return; }
    const choice = event.target.closest('[data-country-choice]');
    if (choice) {
      try {
        localStorage.setItem('safr:country-code:v1',choice.dataset.countryChoice);
        if (choice.dataset.countryDestination) localStorage.setItem('safr:selected-country:v1',choice.dataset.countryDestination);
      } catch {}
      document.dispatchEvent(new CustomEvent('safr:country-selected',{detail:{country:choice.dataset.countryChoice}}));
      if (choice instanceof HTMLAnchorElement) { close(); return; }
      const country = choice.dataset.countryName;
      assessment.querySelector('[data-country-assessment-name]').textContent = country;
      contact.dataset.supportCountry = country;
      contact.dataset.supportCountryCode = choice.dataset.countryChoice;
      contact.dataset.supportMessage = dialog.dataset.countryLocale === 'en' ? `I would like to ask about services in ${country}.` : `Хочу уточнить услуги в стране: ${country}.`;
      assessment.hidden = false;
      assessment.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
      contact.focus({preventScroll:true});
      return;
    }
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  },true);
  addEventListener('resize',() => { if (dialog.open) position(); });
}
