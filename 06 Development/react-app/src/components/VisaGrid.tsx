import type { CatalogItem } from "../catalog";

export function VisaGrid({
  visas,
  onSelect,
}: {
  visas: readonly CatalogItem[];
  onSelect: (visaId: string) => void;
}) {
  return (
    <div className="visa-grid" aria-label="Доступные визы">
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
            Подробнее <i aria-hidden="true">→</i>
          </span>
        </button>
      ))}
    </div>
  );
}
