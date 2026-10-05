// Preview UI only; never changes the public RU/EN preference or routes.
export const languageChoices = [
  ["ru", "RU", "Русский"], ["en", "EN", "English"], ["zh-Hans", "中文", "简体中文"],
  ["ko", "KO", "한국어"], ["fr", "FR", "Français"], ["de", "DE", "Deutsch"],
  ["ja", "JA", "日本語"], ["hi", "HI", "हिन्दी"], ["es", "ES", "Español"], ["ar", "AR", "العربية"],
];
export function supportedLanguage(value) {
  const tag = String(value ?? "").toLowerCase().replaceAll("_", "-");
  if (/^zh(?:-|$)/.test(tag)) return /hant|tw|hk|mo/.test(tag) ? null :
    /^(zh|zh-cn|zh-sg|zh-hans)(-|$)/.test(tag) ? "zh-Hans" : null;
  return languageChoices.find(([code]) => code === tag.split("-")[0])?.[0] ?? null;
}
export function determineLanguage({explicit, saved, telegram, browser = []}) {
  return supportedLanguage(explicit) ?? supportedLanguage(saved) ?? supportedLanguage(telegram) ??
    browser.map(supportedLanguage).find(Boolean) ?? null;
}
export const languageScript = `(() => {
  const removeExpiredUsd = () => {
    for (const node of document.querySelectorAll("[data-preview-usd-expires]")) {
      const expiry = Date.parse(node.dataset.previewUsdExpires);
      if (!Number.isFinite(expiry) || Date.now() > expiry) node.remove();
    }
  };
  removeExpiredUsd();
  for (const node of document.querySelectorAll("[data-preview-usd-expires]")) {
    window.setTimeout(removeExpiredUsd,Math.max(0,Math.min(Date.parse(node.dataset.previewUsdExpires)-Date.now()+25,2147483647)));
  }
  window.addEventListener("focus",removeExpiredUsd);
  document.addEventListener("visibilitychange",removeExpiredUsd);
  const button = document.querySelector("[data-language-button]");
  const dialog = document.querySelector("[data-language-dialog]");
  if (!button || !dialog) return;
  const key = "safr:registry-preview-locale:v1";
  const dismissed = key + ":dismissed";
  const codes = ["ru","en","zh-Hans","ko","fr","de","ja","hi","es","ar"];
  const normalize = value => {
    const tag = String(value || "").toLowerCase().replaceAll("_","-");
    if (/^zh(?:-|$)/.test(tag)) return /hant|tw|hk|mo/.test(tag) ? null :
      /^(zh|zh-cn|zh-sg|zh-hans)(-|$)/.test(tag) ? "zh-Hans" : null;
    return codes.find(code => code === tag.split("-")[0]) || null;
  };
  const get = (storage, name) => {try {return window[storage].getItem(name);} catch {return null;}};
  const put = (storage, name, value) => {try {window[storage].setItem(name, value);} catch {}};
  const open = () => {dialog.showModal(); button.setAttribute("aria-expanded","true");};
  const close = () => {put("sessionStorage",dismissed,"1");dialog.close();};
  button.addEventListener("click", open);
  dialog.querySelector("[data-language-close]").addEventListener("click", close);
  dialog.addEventListener("cancel", () => put("sessionStorage",dismissed,"1"));
  dialog.addEventListener("close", () => {
    button.setAttribute("aria-expanded","false");
    put("sessionStorage", dismissed, "1"); button.focus();
  });
  dialog.addEventListener("click", event => {if(event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  }});
  dialog.querySelectorAll("[data-language-choice]").forEach(link => link.addEventListener("click", () =>
    put("localStorage", key, link.dataset.languageChoice)));
  const url = new URL(location.href);
  // An explicit deep link wins and NEVER overwrites a saved manual preference.
  if (url.searchParams.has("locale")) return;
  const selected = normalize(get("localStorage",key)) ||
    normalize(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code) ||
    (navigator.languages || [navigator.language]).map(normalize).find(Boolean);
  if (selected && selected !== document.documentElement.lang) {
    url.searchParams.set("locale",selected); location.replace(url.href);
  } else if (!selected && !get("sessionStorage",dismissed)) open();
})();`;
