import {AppIcon} from "./AppIcon";
import type {AppearanceTheme} from "./AppearanceControls";
import {
  CLIENT_UI_LANGUAGE_OPTIONS, requireClientUiBindings, type ClientUiBindings,
} from "../i18n/client-ui-bindings";

/** Client-only; original Admin/RUEN appearance component remains unchanged. */
export function ClientAppearanceControls({ui, onLocaleChange, theme, onThemeChange}: {
  ui: ClientUiBindings;
  onLocaleChange: (value: unknown) => void;
  theme: AppearanceTheme;
  onThemeChange: (value: AppearanceTheme) => void;
}) {
  const binding = requireClientUiBindings(ui);
  const text = binding.text;
  return <div className="appearance-controls client-appearance-controls" aria-label={text("inline:06 Development/react-app/src/components/AppearanceControls.tsx#96fed66e8957")}>
    <button className="theme-toggle" type="button"
      aria-label={text(theme === "dark" ? "inline:06 Development/react-app/src/components/AppearanceControls.tsx#08827cbe344c" : "inline:06 Development/react-app/src/components/AppearanceControls.tsx#459c01fadfcf")}
      onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}>
      <AppIcon name={theme === "dark" ? "moon" : "sun"}/>
    </button>
    <select className="compact-locale" aria-label={text("inline:06 Development/react-app/src/components/AppearanceControls.tsx#cfa8fb87b001")}
      value={binding.locale} onChange={event => onLocaleChange(event.target.value)}>
      {CLIENT_UI_LANGUAGE_OPTIONS.map(option => <option key={option.code} value={option.code}
        lang={option.code} dir="auto">{option.label}</option>)}
    </select>
  </div>;
}
