const themeKey = "safrway:appearance";

function applyTheme(theme) {
  const selected = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selected;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    selected === "dark" ? "#0b1914" : "#f5f2ea",
  );
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-checked',String(selected==='dark'));
    const en=document.documentElement.lang==='en';
    button.title=selected==='dark'?(en?'Switch to light appearance':'Включить светлую тему'):(en?'Switch to dark appearance':'Включить тёмную тему');
  });
  document.querySelectorAll("[data-public-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.publicThemeChoice === selected));
  });
}

let initial = "dark";
try {
  initial = window.localStorage.getItem(themeKey) === "light" ? "light" : "dark";
} catch {}
applyTheme(initial);

let themeTransitionTimer;

document.querySelectorAll("[data-public-theme-choice], [data-theme-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.hasAttribute("data-theme-toggle") ? (document.documentElement.dataset.theme === "dark" ? "light" : "dark") : button.dataset.publicThemeChoice === "light" ? "light" : "dark";
    try { window.localStorage.setItem(themeKey, selected); } catch {}
    clearTimeout(themeTransitionTimer);
    document.documentElement.dataset.themeChanging = "true";
    applyTheme(selected);
    themeTransitionTimer = setTimeout(() => {
      delete document.documentElement.dataset.themeChanging;
    }, 240);
  });
});
