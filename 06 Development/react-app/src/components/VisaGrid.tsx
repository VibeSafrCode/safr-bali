import type { CatalogItem } from "../catalog";
import { useI18n } from "../i18n/runtime";

export function VisaGrid({
  visas,
  onSelect,
}: {
  visas: readonly CatalogItem[];
  onSelect: (visaId: string) => void;
}) {
  const { t } = useI18n();
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
          {visa.note && <b>{visa.note}</b>}
          <span className="visa-card-action">
            {t("catalog.details")} <i aria-hidden="true">→</i>
          </span>
        </button>
      ))}
    </div>
  );
}
