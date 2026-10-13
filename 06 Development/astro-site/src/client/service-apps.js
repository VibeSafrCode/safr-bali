import {publicSourceRoute} from '../lib/public-locale';
import {publicInteractionLocale,publicInteractionDocumentLocale,publicInteractionText} from '../lib/public-interactions.mjs';
const route = publicSourceRoute(location.pathname);
const country = route === '/uae/' ? 'uae' : route.split('/').filter(Boolean)[0];
if (['bali', 'thailand', 'russia', 'nepal', 'uae'].includes(country)) {
  try { localStorage.setItem('safr:public-country:v1', country); } catch {}
}
const workspace = document.querySelector('[data-visa-workspace]');
if (workspace instanceof HTMLElement) {
  const locale = publicInteractionLocale(workspace.dataset.locale);
  const interactionText = (key,variables={}) => publicInteractionText(key,locale,variables);
  const form = workspace.querySelector('[data-visa-preferences]');
  const request = workspace.querySelector('[data-visa-request]');
  const saved = workspace.querySelector('[data-visa-saved]');
  const catalog = document.getElementById('visa-options');
  const controls = workspace.querySelector('[data-visa-controls]');
  const buttons = [...workspace.querySelectorAll('[data-visa-view]')];
  const panels = [...workspace.querySelectorAll('[data-visa-panel]')];
  if (controls instanceof HTMLElement) controls.hidden = false;
  const view = (name) => {
    panels.forEach(p => { p.hidden = p.dataset.visaPanel !== name; });
    if (catalog) catalog.hidden = name !== 'catalog';
    document.querySelectorAll('[data-visa-catalog-content]').forEach(p => { p.hidden = name !== 'catalog'; });
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.visaView === name)));
    if (name === 'catalog') catalog?.setAttribute('tabindex', '-1');
  };
  buttons.forEach(b => b.addEventListener('click', () => {
    view(b.dataset.visaView);
    history.replaceState(null, '', location.pathname + location.search + (b.dataset.visaView === 'catalog' ? '#visa-options' : ''));
  }));
  view(location.hash === '#visa-options' ? 'catalog' : 'plan');
  const key = 'safr:visa-preferences:v1:' + locale;
  if (form instanceof HTMLFormElement && request instanceof HTMLElement) {
    try {
      const previous = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (previous) [...form.elements].forEach(el => {
        if (el instanceof HTMLInputElement && ['purpose','duration'].includes(el.name)) el.checked = el.value === previous[el.name];
        if (el instanceof HTMLSelectElement && [...el.options].some(o => o.value === previous.duration)) el.value = previous.duration;
      });
    } catch {}
    const update = (persist = false) => {
      const values = Object.fromEntries(new FormData(form));
      request.dataset.supportMessage = interactionText('visa.requestTemplate',{values_purpose______:values.purpose ?? '',values_duration______:values.duration ?? ''});
      if (persist) {
        try { sessionStorage.setItem(key, JSON.stringify(values)); if (saved) saved.textContent = interactionText('visa.sessionSaved'); } catch {}
      }
    };
    form.addEventListener('change', () => update(true));
    form.addEventListener('submit', e => { e.preventDefault(); request.click(); });
    update();
  }
}
const bike = document.querySelector('[data-bike-workspace]');
if (bike instanceof HTMLElement && new URLSearchParams(location.search).get('service') === 'bikes') {
  const parent = bike.parentElement;
  if (parent) [...parent.children].forEach(child => { if (child instanceof HTMLElement) child.hidden = child !== bike; });
  const originalTitle = parent?.querySelector('h1');
  const bikeTitle = bike.querySelector('[data-bike-title]');
  if (originalTitle && bikeTitle) {
    const secondary = document.createElement('h2');
    secondary.textContent = originalTitle.textContent;
    originalTitle.replaceWith(secondary);
    const primary = document.createElement('h1');
    primary.textContent = bikeTitle.textContent;
    bikeTitle.replaceWith(primary);
  }
  bike.hidden = false;
  document.title = publicInteractionText('bike.documentTitle',publicInteractionDocumentLocale(document.documentElement));
}
