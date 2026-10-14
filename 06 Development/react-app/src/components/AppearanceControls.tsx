import {AppIcon} from './AppIcon';
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isYogaBrand } from "../ui/client-brand";

export type AppearanceTheme = "dark" | "light";
export type InterfaceLocale = "ru" | "en";

const STORAGE_KEY = isYogaBrand ? "yoga-gangster:appearance" : "safrway:appearance";

function initialTheme(): AppearanceTheme {
  if (isYogaBrand) return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "light" ? "light" : "dark";
}

export function useAppearance() {
  const [theme, setTheme] = useState<AppearanceTheme>(initialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if (!isYogaBrand) window.localStorage.setItem(STORAGE_KEY, theme);
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
  const [languageOpen, setLanguageOpen] = useState(false);
  const languagePicker = useRef<HTMLDivElement>(null);
  const languageTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!languageOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!languagePicker.current?.contains(event.target as Node)) setLanguageOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setLanguageOpen(false); languageTrigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [languageOpen]);
  if (isYogaBrand) return (
    <div className="appearance-controls yoga-appearance" aria-label={locale === "ru" ? "Язык и тема" : "Language and theme"}>
      <div className="yoga-language-picker" ref={languagePicker}>
        <button ref={languageTrigger} className="yoga-language-trigger" type="button" aria-label={`${locale.toUpperCase()} — ${locale === "ru" ? "Выбрать язык" : "Choose language"}`} aria-expanded={languageOpen} aria-controls="yoga-language-options" onClick={() => setLanguageOpen(!languageOpen)}>{locale.toUpperCase()}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4 3 3 3-3"/></svg></button>
        {languageOpen && <div className="yoga-language-options" id="yoga-language-options" role="group" aria-label={locale === "ru" ? "Язык интерфейса" : "Interface language"}>
          {(["ru", "en"] as const).map(item => <button type="button" key={item} aria-pressed={locale === item} onClick={() => { onLocaleChange(item); setLanguageOpen(false); languageTrigger.current?.focus(); }}><strong>{item.toUpperCase()}</strong><span>{item === "ru" ? "Русский" : "English"}</span></button>)}
        </div>}
      </div>
      <button className="theme-toggle" type="button" aria-label={locale === "ru" ? (theme === "dark" ? "Светлая тема" : "Тёмная тема") : (theme === "dark" ? "Light theme" : "Dark theme")} onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}><AppIcon name={theme === "dark" ? "moon" : "sun"}/></button>
    </div>
  );
  const redesigned=document.documentElement.dataset.appDesign==='true';
  return (
    <div className="appearance-controls" aria-label={locale === "ru" ? "Язык и тема" : "Language and theme"}>
      <div className="appearance-segment" role="group" aria-label={locale === "ru" ? "Язык" : "Language"}>
        {(["ru", "en"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={locale === item} onClick={() => onLocaleChange(item)}>
            {item.toUpperCase()}
          </button>
        ))}
      </div>
      {redesigned?<>
      <button className="theme-toggle" type="button" aria-label={locale==='ru'?(theme==='dark'?'Светлая тема':'Тёмная тема'):(theme==='dark'?'Light theme':'Dark theme')} onClick={()=>onThemeChange(theme==='dark'?'light':'dark')}><AppIcon name={theme==='dark'?'moon':'sun'}/></button>
      <select className="compact-locale" aria-label={locale==='ru'?'Язык':'Language'} value={locale} onChange={e=>onLocaleChange(e.target.value as InterfaceLocale)}><option value="ru">RU</option><option value="en">EN</option></select>
      </>:<div className="appearance-segment" role="group" aria-label={locale==='ru'?'Тема':'Theme'}><button type="button" aria-label={locale==='ru'?'Светлая тема':'Light theme'} aria-pressed={theme==='light'} onClick={()=>onThemeChange('light')}>☀</button><button type="button" aria-label={locale==='ru'?'Тёмная тема':'Dark theme'} aria-pressed={theme==='dark'} onClick={()=>onThemeChange('dark')}>◐</button></div>}
    </div>
  );
}
