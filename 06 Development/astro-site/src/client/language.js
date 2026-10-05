// One small CSP-safe pre-paint asset; no fetch, redirects or hydration gap.
// Delegation works before the body is parsed and keeps native links usable.
(() => {
  const preferenceKey = "safr:public-locale:v1";
  // The production picker now owns language detection. Do not simultaneously
  // activate the retired RU/EN suggestion banner behind the language dialog.
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const choice = event.target.closest("[data-language-choice]");
    const accept = event.target.closest("[data-language-suggestion-accept]");
    const decline = event.target.closest("[data-language-suggestion-decline]");
    if (!choice && !accept && !decline) return;
    const locale = choice?.getAttribute("data-language-choice") ?? (accept ? "en" : "ru");
    try { window.localStorage.setItem(preferenceKey, locale); } catch {}
    if (decline) {
      delete document.documentElement.dataset.suggestEnglish;
    }
  });
})();
