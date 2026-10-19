import { AppIcon } from "./AppIcon";
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import "./client-navigation.css";

export function RequestsEntry({ locale, ui, count, onOpen }: { locale: "ru" | "en"; ui?:ClientUiBindings; count: number | null; onOpen: () => void }) {
  const binding=YOGA_MINI_APP||ui===undefined?undefined:requireClientUiBindings(ui);
  const title=binding?binding.text('inline:06 Development/react-app/src/components/RequestsEntry.tsx#c0b8ac51fa23'):locale === "ru" ? "Заявки" : "Requests";
  const detail=binding?binding.text('inline:06 Development/react-app/src/components/RequestsEntry.tsx#13bbaae95518'):locale === "ru" ? "Выбранные услуги и статус оформления" : "Selected services and request status";
  return <button className="client-requests-entry" type="button" onClick={onOpen} lang={binding?.locale} dir={binding?.dir}>
    <AppIcon name="▤" /><span><strong>{title}{count === null ? " · —" : count > 0 ? ` · ${count}` : ""}</strong><small>{detail}</small></span><AppIcon name="→" />
  </button>;
}
