const root = document.querySelector("[data-public-home]");

if (root instanceof HTMLElement) {
  const countries = Array.from(
    root.querySelectorAll("[data-public-country]"),
  );
  const selectors = Array.from(
    root.querySelectorAll("[data-public-country-select]"),
  );
  const panels = Array.from(root.querySelectorAll("[data-public-services]"));
  const actions = Array.from(
    root.querySelectorAll("[data-public-country-action]"),
  );
  const search = root.querySelector("[data-public-country-search]");
  const empty = root.querySelector("[data-public-country-empty]");
  const title = root.querySelector("[data-public-services-title]");
  const storageKey = "safr:public-country:v1";

  root.dataset.homeEnhanced = "true";
  const phoneCopy = matchMedia('(max-width: 699px)');
  const copyNodes = [...root.querySelectorAll('[data-phone-copy]')].map(element => ({element, full:element.textContent}));
  const fullPlaceholder = search?.getAttribute('placeholder') || '';
  const applyPhoneCopy = () => {
    copyNodes.forEach(({element, full}) => {element.textContent = phoneCopy.matches ? element.dataset.phoneCopy : full;});
    search?.setAttribute('placeholder',phoneCopy.matches ? search.dataset.phonePlaceholder : fullPlaceholder);
  };
  phoneCopy.addEventListener('change',applyPhoneCopy);
  applyPhoneCopy();


  const reveal = () => {
    const rail = root.querySelector('.public-country-rail');
    const active = root.querySelector('[data-public-country][data-selected="true"]');
    if (!(rail instanceof HTMLElement) || !(active instanceof HTMLElement) || rail.scrollWidth <= rail.clientWidth) return;
    const rect=active.getBoundingClientRect(), parent=rail.getBoundingClientRect();
    if(rect.left < parent.left || rect.right > parent.right) rail.scrollTo({left:rail.scrollLeft+rect.left-parent.left-(parent.width-rect.width)/2,behavior:'instant'});
  };
  addEventListener('resize',()=>requestAnimationFrame(reveal));
  const select = (id) => {
    if (!id) return;
    document.documentElement.dataset.world = id;
    document.querySelectorAll("[data-world-image]").forEach(image => {
      const active = image.dataset.worldImage === id;
      if (active && image instanceof HTMLImageElement && !image.hasAttribute('src')) {
        image.srcset = image.dataset.worldSrcset ?? '';
        image.src = image.dataset.worldSrc ?? '';
      }
      image.dataset.active = String(active);
    });
    countries.forEach((country) => {
      if (country instanceof HTMLElement) {
        country.dataset.selected = String(
          country.dataset.publicCountry === id,
        );
      }
    });
    selectors.forEach((selector) => {
      if (selector instanceof HTMLElement) {
        if (selector.dataset.publicCountrySelect === id) {
          selector.setAttribute("aria-current", "true");
        } else {
          selector.removeAttribute("aria-current");
        }
      }
    });
    panels.forEach((panel) => {
      if (panel instanceof HTMLElement) {
        panel.hidden = panel.dataset.publicServices !== id;
      }
    });
    actions.forEach((action) => {
      if (action instanceof HTMLElement) {
        action.hidden = action.dataset.publicCountryAction !== id;
      }
    });
    if (title instanceof HTMLElement) {
      const country = countries.find(
        (candidate) =>
          candidate instanceof HTMLElement &&
          candidate.dataset.publicCountry === id,
      );
      if (country instanceof HTMLElement && country.dataset.countryHelp) {
        title.textContent = country.dataset.countryHelp;
      }
    }
    const activePanel=panels.find(panel=>panel.dataset.publicServices===id);
    const surface=root.querySelector('.public-services-panel');
    if(surface instanceof HTMLElement && activePanel) surface.style.setProperty('--service-surface-width',Math.max(380,Math.min(activePanel.querySelectorAll('.service-app').length,6)*140+64)+'px');
    requestAnimationFrame(reveal);
    try {
      window.localStorage.setItem(storageKey, id);
    } catch {}
  };

  selectors.forEach((selector) => {
    if (selector instanceof HTMLAnchorElement) {
      selector.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        select(selector.dataset.publicCountrySelect);
      });
    }
  });

  if (search instanceof HTMLInputElement) {
    search.addEventListener("input", () => {
      const query = search.value.trim().toLocaleLowerCase(document.documentElement.lang);
      const visible = countries.filter((country) => {
        if (!(country instanceof HTMLElement)) return false;
        const matches =
          !query || (country.dataset.countryName ?? "").startsWith(query);
        country.hidden = !matches;
        return matches;
      });
      if (empty instanceof HTMLElement) empty.hidden = visible.length > 0;
      const dashboard = root.querySelector(".public-home-dashboard");
      if (dashboard instanceof HTMLElement) dashboard.hidden = visible.length === 0;
      const selectedVisible = visible.find(
        (country) => country.dataset.selected === "true",
      );
      if (!selectedVisible && visible[0] instanceof HTMLElement) {
        select(visible[0].dataset.publicCountry);
      }
    });
  }

  let stored = null;
  try {
    stored = window.localStorage.getItem(storageKey);
  } catch {}
  if (
    stored &&
    countries.some(
      (country) =>
        country instanceof HTMLElement &&
        country.dataset.publicCountry === stored,
    )
  ) {
    select(stored);
  } else if (countries[0] instanceof HTMLElement) {
    select(countries[0].dataset.publicCountry);
  }
}
