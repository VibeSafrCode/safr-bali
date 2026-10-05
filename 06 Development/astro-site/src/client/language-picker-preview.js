const trigger = document.querySelector('[data-lp-open]');
const dialog = document.querySelector('#site-language-dialog');
if (trigger instanceof HTMLButtonElement && dialog instanceof HTMLDialogElement) {
  let previousOverflow = '';
  let closeTimer;
  const position = () => {
    if (matchMedia('(max-width:699px)').matches) return;
    const box = trigger.getBoundingClientRect();
    dialog.style.top = `${Math.min(box.bottom + 12, 100)}px`;
    dialog.style.right = `${Math.max(16, innerWidth - box.right)}px`;
  };
  const open = () => {
    if (dialog.open) return;
    document.querySelector('[data-menu-toggle]')?.setAttribute('aria-expanded', 'false');
    document.querySelector('.site-header')?.removeAttribute('data-menu-open');
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.classList.remove('lp-closing');
    position();
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    if (!dialog.open || dialog.classList.contains('lp-closing')) return;
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) return dialog.close();
    dialog.classList.add('lp-closing');
    closeTimer = setTimeout(() => dialog.close(), 140);
  };
  trigger.addEventListener('click', open);
  dialog.querySelector('[data-lp-close]')?.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    clearTimeout(closeTimer);
    document.body.style.overflow = previousOverflow;
    dialog.classList.remove('lp-closing');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus({preventScroll:true});
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  });
  addEventListener('resize', () => { if (dialog.open) position(); });
  if (new URL(location.href).searchParams.get('languages') === 'open') open();
}
