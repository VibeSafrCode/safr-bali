import type { Destination } from "../catalog";
import { countryTheme } from "../countryThemes";
import { useI18n } from "../i18n/runtime";

export function ManagerContactCard({
  destination,
  onContact,
}: {
  destination: Destination;
  onContact: () => void;
}) {
  const { locale, t } = useI18n();
  const theme = countryTheme(destination, locale);
  return (
    <article className="manager-contact-card">
      <span className="manager-avatar" aria-hidden="true">S</span>
      <div>
        <strong>{t("managerCard.title")}</strong>
        <p>{t("managerCard.description", { location: theme.locativeName })}</p>
      </div>
      <button className="button secondary" type="button" onClick={onContact}>
        {t("managerCard.contact")}
      </button>
    </article>
  );
}
