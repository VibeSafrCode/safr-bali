const root = document.querySelector("[data-public-home]");

if (root instanceof HTMLElement) {
  const countries = Array.from(
    root.querySelectorAll("[data-public-country]"),
  );
  const panels = Array.from(root.querySelectorAll("[data-public-services]"));
  const actions = Array.from(
    root.querySelectorAll("[data-public-country-action]"),
  );
  const search = root.querySelector("[data-public-country-search]");
  const empty = root.querySelector("[data-public-country-empty]");
  const title = root.querySelector("[data-public-services-title]");
  const labels = {
    bali: "на Бали",
    thailand: "в Таиланде",
    russia: "в России",
    nepal: "в Непале",
  };
  const storageKey = "safr:public-country:v1";

  const select = (id) => {
    if (!id) return;
    countries.forEach((country) => {
      if (country instanceof HTMLElement) {
        country.dataset.selected = String(
          country.dataset.publicCountry === id,
        );
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
      title.textContent = `Чем помочь ${labels[id] ?? "в выбранной стране"}?`;
    }
    try {
      window.localStorage.setItem(storageKey, id);
    } catch {}
  };

  countries.forEach((country) => {
    if (country instanceof HTMLElement) {
      country.addEventListener("click", () => {
        select(country.dataset.publicCountry);
      });
    }
  });

  if (search instanceof HTMLInputElement) {
    search.addEventListener("input", () => {
      const query = search.value.trim().toLocaleLowerCase("ru-RU");
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
  }
}
