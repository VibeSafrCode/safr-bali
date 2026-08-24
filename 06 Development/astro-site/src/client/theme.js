const themeKey = "safrway:appearance";

function applyTheme(theme) {
  const selected = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selected;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    selected === "dark" ? "#0b1914" : "#f5f2ea",
  );
  document.querySelectorAll("[data-public-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.publicThemeChoice === selected));
  });
}

let initial = "dark";
try {
  initial = window.localStorage.getItem(themeKey) === "light" ? "light" : "dark";
} catch {}
applyTheme(initial);

document.querySelectorAll("[data-public-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.dataset.publicThemeChoice === "light" ? "light" : "dark";
    try { window.localStorage.setItem(themeKey, selected); } catch {}
    applyTheme(selected);
  });
});
