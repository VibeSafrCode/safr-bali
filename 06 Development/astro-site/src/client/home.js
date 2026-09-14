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
    if (!(rail instanceof HTMLElement) || rail.dataset.carousel === 'true' || !(active instanceof HTMLElement) || rail.scrollWidth <= rail.clientWidth) return;
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
  initCountryCarousel(root);
}

// Native scrolling keeps touch momentum and vertical page scrolling available.
function initCountryCarousel(root) {
  const rail = root.querySelector('.public-country-rail');
  const controls = root.querySelector('[data-country-carousel-controls]');
  if (!(rail instanceof HTMLElement) || !(controls instanceof HTMLElement)) return;
  const cards = [...rail.querySelectorAll('[data-public-country]')];
  const media = matchMedia('(max-width: 1279px), (pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = false, adjusting = false, touching = false, timer, suppressUntil = 0;
  let startX = 0, startY = 0, pointerFocusing = false;
  const visible = () => [...rail.children].filter(card => card instanceof HTMLElement && !card.hidden);
  let bendFrame = 0;
  const bendEdges = () => {
    bendFrame = 0;
    const bounds = rail.getBoundingClientRect();
    const viewportLeft = bounds.left + 4, viewportRight = bounds.right - 4;
    cards.forEach(card => {
      const face = card.querySelector('.country-card-face');
      if (!face) return;
      const box = card.getBoundingClientRect();
      const shown = Math.max(0, Math.min(box.right,viewportRight)-Math.max(box.left,viewportLeft));
      const fraction = enabled && box.width ? Math.max(.015,Math.min(1,shown/box.width)) : 1;
      face.style.setProperty('--edge-squeeze',String(fraction));
      face.style.setProperty('--edge-unsqueeze',String(1/fraction));
      face.style.setProperty('--edge-visible-width',`${enabled?shown:box.width}px`);
      face.style.setProperty('--edge-caption-opacity',fraction<.4?'0':'1');
      face.style.setProperty('--edge-origin',box.left<viewportLeft?'100% 50%':'0% 50%');
      face.style.setProperty('--edge-turn',`${(box.left<viewportLeft?-1:1)*(1-fraction)*24}deg`);
    });
  };
  const scheduleBend = () => {if(!bendFrame)bendFrame=requestAnimationFrame(bendEdges);};
  rail.addEventListener('scroll',scheduleBend,{passive:true});

  const left = () => rail.getBoundingClientRect().left + 4;
  const nearest = () => visible().reduce((best, card) =>
    !best || Math.abs(card.getBoundingClientRect().left-left()) < Math.abs(best.getBoundingClientRect().left-left()) ? card : best, null);
  const scrollToCard = (card, smooth = false) => {
    if (!card) return;
    rail.scrollTo({left:rail.scrollLeft+card.getBoundingClientRect().left-left(),behavior:smooth&&!reduced.matches?'smooth':'instant'});
  };
  // Keep one card behind the visible start. Reuse originals so state/listeners stay intact.
  const balance = (anchor = nearest(), align = false) => {
    if (!enabled || adjusting || touching || !anchor || rail.hidden || !rail.clientWidth) return;
    const list = visible();
    if (list.length < 4) return;
    const index = list.indexOf(anchor);
    if (index === 1 && !align) return;
    const moving = index === 0 ? [list[list.length-1]] : list.slice(0, index-1);
    if (moving.some(card => card.contains(document.activeElement))) return;
    adjusting = true;
    rail.style.scrollSnapType = 'none';
    const before = anchor.getBoundingClientRect().left;
    if (index === 0) rail.prepend(moving[0]);
    else moving.forEach(card => rail.append(card));
    rail.scrollLeft += anchor.getBoundingClientRect().left-before;
    if (align) scrollToCard(anchor);
    bendEdges();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      rail.style.removeProperty('scroll-snap-type');
      adjusting = false;
    }));
  };
  const settle = () => {
    clearTimeout(timer);
    timer = setTimeout(() => balance(), 160);
  };
  const configure = () => {
    enabled = media.matches;
    rail.dataset.carousel = String(enabled);
    // Controls live inside an overview wrapper; do not unhide a focused world.
    controls.hidden = !enabled;
    rail.style.scrollSnapType = 'none';
    cards.forEach(card => rail.append(card));
    rail.scrollLeft = 0;
    rail.style.removeProperty('scroll-snap-type');
    scheduleBend();
    if (enabled && !rail.hidden) {
      const selected = cards.find(card => card.dataset.selected === 'true' && !card.hidden) || visible()[0];
      balance(selected, true);
    }
  };
  rail.addEventListener('scroll', () => { if (!adjusting) settle(); }, {passive:true});
  rail.addEventListener('scrollend', () => { if (!adjusting) balance(); });
  rail.addEventListener('pointerdown', event => { touching = true; startX=event.clientX; startY=event.clientY; }, {passive:true});
  rail.addEventListener('pointermove', event => {
    if (touching && Math.abs(event.clientX-startX)>10 && Math.abs(event.clientX-startX)>Math.abs(event.clientY-startY)) suppressUntil=performance.now()+400;
  }, {passive:true});
  const release = () => { touching=false; settle(); };
  window.addEventListener('pointerup',release,{passive:true});
  window.addEventListener('pointercancel',release,{passive:true});
  rail.addEventListener('click',event => {
    if (enabled && performance.now()<suppressUntil) {event.preventDefault();event.stopImmediatePropagation();}
  },true);
  rail.addEventListener('dragstart',event => {if(enabled)event.preventDefault();});
  // Pointer selection must not scroll a partial card away before its click lands.
  // Preserve focus without scrolling; keyboard navigation still reveals its card.
  rail.addEventListener('mousedown',event => {
    const target = event.target.closest('a');
    if (!enabled || event.button !== 0 || !target) return;
    event.preventDefault();
    pointerFocusing = true;
    target.focus({preventScroll:true});
    pointerFocusing = false;
  });
  rail.addEventListener('focusin',event => {
    if (!enabled || touching || pointerFocusing) return;
    const card=event.target.closest('[data-public-country]');
    if (!card) return;
    const rect=card.getBoundingClientRect(), bounds=rail.getBoundingClientRect();
    if(rect.left<bounds.left || rect.right>bounds.right) scrollToCard(card);
  });
  rail.addEventListener('focusout',settle);
  root.querySelectorAll('[data-country-step]').forEach(button => button.addEventListener('click',()=>{
    const list=visible(), anchor=nearest(), direction=Number(button.dataset.countryStep);
    if (!anchor || !list.length) return;
    balance(anchor);
    const ordered=visible(),index=ordered.indexOf(anchor);
    scrollToCard(ordered[(index+direction+ordered.length)%ordered.length], true);
  }));
  rail.addEventListener('country-reveal',()=>{
    const selected=cards.find(card=>card.dataset.selected==='true');
    if(enabled){balance(selected,true);scrollToCard(selected);scheduleBend();}
  });
  root.querySelector('[data-public-country-search]')?.addEventListener('input',configure);
  media.addEventListener('change',configure);
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(configure,180);});
  configure();
}
