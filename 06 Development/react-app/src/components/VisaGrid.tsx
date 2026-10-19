import { YOGA_MINI_APP } from "../runtime/yoga-mini-app";
import type { CatalogItem } from "../catalog";
import { useI18n } from "../i18n/runtime";
import { compactPriceLabel, usePricing, visaEntityKeyByCatalogId } from "../pricing/runtime";
import {requireClientUiBindings, type ClientUiBindings} from '../i18n/client-ui-bindings';
import {clientCompactPriceLabels} from '../i18n/client-catalog-journey';

export function VisaGrid({
  visas,
  onSelect,
  ui,
}: {
  visas: readonly CatalogItem[];
  onSelect: (visaId: string) => void;
  ui?:ClientUiBindings;
}) {
  const { locale, t:legacyText } = useI18n();
  const client=YOGA_MINI_APP || ui===undefined?undefined:requireClientUiBindings(ui),t=client?.text??legacyText;
  const { projection } = usePricing();
  return (
    <div className="visa-grid" aria-label={t("catalog.visasAria")}>
      {visas.map((visa) => (
        <button
          className="visa-card"
          key={visa.id}
          type="button"
          onClick={() => onSelect(visa.id)}
        >
          <span className="visa-card-summary">{visa.summary}</span>
          <strong>{visa.name}</strong>
          {visaEntityKeyByCatalogId[visa.id] && (
            <b>{compactPriceLabel(projection, "VISA", visaEntityKeyByCatalogId[visa.id], locale,client?clientCompactPriceLabels(client):undefined)}</b>
          )}
          <span className="visa-card-action">
            {t("catalog.details")} <i aria-hidden="true">→</i>
          </span>
        </button>
      ))}
    </div>
  );
}
