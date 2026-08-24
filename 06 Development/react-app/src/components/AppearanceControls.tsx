import { useEffect, useState } from "react";

export type AppearanceTheme = "dark" | "light";
export type InterfaceLocale = "ru" | "en";

const STORAGE_KEY = "safrway:appearance";

function initialTheme(): AppearanceTheme {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "light" ? "light" : "dark";
}

export function useAppearance() {
  const [theme, setTheme] = useState<AppearanceTheme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return { theme, setTheme };
}

export function useDocumentLocale(): InterfaceLocale {
  const read = () => document.documentElement.lang === "en" ? "en" : "ru";
  const [locale, setLocale] = useState<InterfaceLocale>(read);

  useEffect(() => {
    const observer = new MutationObserver(() => setLocale(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  return locale;
}

export function AppearanceControls({
  locale,
  onLocaleChange,
  theme,
  onThemeChange,
}: {
  locale: "ru" | "en";
  onLocaleChange: (locale: "ru" | "en") => void;
  theme: AppearanceTheme;
  onThemeChange: (theme: AppearanceTheme) => void;
}) {
  return (
    <div className="appearance-controls" aria-label={locale === "ru" ? "Язык и тема" : "Language and theme"}>
      <div className="appearance-segment" role="group" aria-label={locale === "ru" ? "Язык" : "Language"}>
        {(["ru", "en"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={locale === item} onClick={() => onLocaleChange(item)}>
            {item.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="appearance-segment" role="group" aria-label={locale === "ru" ? "Тема" : "Theme"}>
        <button type="button" aria-label={locale === "ru" ? "Светлая тема" : "Light theme"} aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}>☀</button>
        <button type="button" aria-label={locale === "ru" ? "Тёмная тема" : "Dark theme"} aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}>◐</button>
      </div>
    </div>
  );
}
