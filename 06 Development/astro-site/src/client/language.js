const preferenceKey = "safr:public-locale:v1";
const suggestion = document.querySelector("[data-language-suggestion]");

document.querySelectorAll("[data-language-choice]").forEach((choice) => {
  choice.addEventListener("click", () => {
    try {
      window.localStorage.setItem(preferenceKey, choice.dataset.languageChoice ?? "ru");
    } catch {}
  });
});

if (suggestion instanceof HTMLElement) {
  let preference = null;
  try {
    preference = window.localStorage.getItem(preferenceKey);
  } catch {}
  const browserPrefersEnglish = (navigator.languages ?? [navigator.language]).some(
    (language) => language.toLowerCase().startsWith("en"),
  );
  if (
    suggestion.dataset.currentLocale === "ru" &&
    !preference &&
    browserPrefersEnglish
  ) {
    suggestion.hidden = false;
  }

  suggestion
    .querySelector("[data-language-suggestion-accept]")
    ?.addEventListener("click", () => {
      try {
        window.localStorage.setItem(preferenceKey, "en");
      } catch {}
    });
  suggestion
    .querySelector("[data-language-suggestion-decline]")
    ?.addEventListener("click", () => {
      try {
        window.localStorage.setItem(preferenceKey, "ru");
      } catch {}
      suggestion.hidden = true;
    });
}
