import type { Destination } from "../catalog";
import { countryTheme } from "../countryThemes";

export function ManagerContactCard({
  destination,
  onContact,
}: {
  destination: Destination;
  onContact: () => void;
}) {
  const theme = countryTheme(destination);
  return (
    <article className="manager-contact-card">
      <span className="manager-avatar" aria-hidden="true">S</span>
      <div>
        <strong>Менеджер SAFRWAY</strong>
        <p>Поможет с услугами {theme.locativeName} через защищённый Telegram/CRM-диалог.</p>
      </div>
      <button className="button secondary" type="button" onClick={onContact}>
        Связаться
      </button>
    </article>
  );
}
