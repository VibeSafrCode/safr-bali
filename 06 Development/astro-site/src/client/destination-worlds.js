// Preview on one activation; enter the country services on two.
const root = document.querySelector('[data-public-home]');
if (root instanceof HTMLElement) {
  let lastTouch = null;
  let entering = false;
  addEventListener('pageshow', () => { entering = false; lastTouch = null; });
  const enter = selector => {
    const route = selector.dataset.countryRoute;
    if (!entering && route) { entering = true; location.assign(route); }
  };
  const primary = event => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  root.querySelectorAll('[data-public-country-select]').forEach(selector => {
    selector.addEventListener('click', event => {
      // home.js already prevents the anchor's default and selects the background.
      if (!primary(event) || !(event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents)) return;
      const now = performance.now();
      if (lastTouch?.selector === selector && now - lastTouch.time < 450) {
        lastTouch = null;
        enter(selector);
      } else lastTouch = {selector, time:now};
    });
    selector.addEventListener('dblclick', event => {
      if (event.defaultPrevented || !primary(event)) return;
      event.preventDefault();
      enter(selector);
    });
  });
}
