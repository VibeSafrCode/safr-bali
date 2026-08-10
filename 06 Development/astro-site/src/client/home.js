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

  const select = (id) => {
    if (!id) return;
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
    try {
      window.localStorage.setItem(storageKey, id);
    } catch {}
  };

  selectors.forEach((selector) => {
    if (selector instanceof HTMLAnchorElement) {
      selector.addEventListener("click", (event) => {
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
