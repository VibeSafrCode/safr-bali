const header = document.querySelector('.site-header');
const menuButton = header?.querySelector('[data-menu-toggle]');
const navigation = header?.querySelector('.primary-menu');
if (header instanceof HTMLElement && menuButton instanceof HTMLButtonElement && navigation instanceof HTMLElement) {
  const compact = matchMedia('(max-width: 699px)');
  const close = (restore = false) => {
    menuButton.setAttribute('aria-expanded', 'false');
    delete header.dataset.menuOpen;
    if (restore) menuButton.focus({preventScroll:true});
  };
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    header.toggleAttribute('data-menu-open', open);
  });
  navigation.addEventListener('click', event => {
    if (event.target.closest('a,button')) close();
  });
  document.addEventListener('pointerdown', event => {
    if (!header.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      event.preventDefault(); close(true);
    }
  });
  compact.addEventListener('change', () => {
    const focused = document.activeElement;
    close();
    if (!compact.matches && focused === menuButton) navigation.querySelector('a')?.focus();
    if (compact.matches && navigation.contains(focused)) menuButton.focus();
  });
}
document.querySelector('[data-language-select]')?.addEventListener('change', event => {
  const select = event.currentTarget;
  const option = select.selectedOptions[0];
  try { localStorage.setItem('safr:public-locale:v1', option.dataset.locale); } catch {}
  location.assign(option.value);
});
