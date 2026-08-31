import type { CatalogItem } from "../catalog";
import { useI18n } from "../i18n/runtime";
import { compactPriceLabel, usePricing, visaEntityKeyByCatalogId } from "../pricing/runtime";

export function VisaGrid({
  visas,
  onSelect,
}: {
  visas: readonly CatalogItem[];
  onSelect: (visaId: string) => void;
}) {
  const { locale, t } = useI18n();
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
            <b>{compactPriceLabel(projection, "VISA", visaEntityKeyByCatalogId[visa.id], locale)}</b>
          )}
          <span className="visa-card-action">
            {t("catalog.details")} <i aria-hidden="true">→</i>
          </span>
        </button>
      ))}
    </div>
  );
}
