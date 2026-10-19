import { YOGA_MINI_APP } from "../runtime/yoga-mini-app";
import {AppIcon} from './AppIcon';
import type { Destination } from "../catalog";
import { countryTheme } from "../countryThemes";
import { useI18n } from "../i18n/runtime";
import {requireClientUiBindings, type ClientUiBindings} from '../i18n/client-ui-bindings';

export function ManagerContactCard({
  destination,
  onContact,
  ui,
}: {
  destination: Destination;
  onContact: () => void;
  ui?: ClientUiBindings;
}) {
  const { locale, t:legacyText } = useI18n();
  const client=YOGA_MINI_APP || ui===undefined?undefined:requireClientUiBindings(ui),t=client?.text??legacyText;
  const theme = countryTheme(destination, locale);
  return (
    <article className="manager-contact-card">
      <span className="manager-avatar" aria-hidden="true"><AppIcon name="◌"/></span>
      <div>
        <strong>{t("managerCard.title")}</strong>
        <p>{t("managerCard.description", { location: client?client.text(`theme.${destination.id}.locative`):theme.locativeName })}</p>
      </div>
      <button className="button secondary" type="button" onClick={onContact}>
        {t("managerCard.contact")}
      </button>
    </article>
  );
}
