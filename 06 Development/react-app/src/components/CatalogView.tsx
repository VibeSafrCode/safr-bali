import { destinationById, destinations } from "../catalog";
import type { RouteContext } from "../api/types";

type CatalogViewProps = {
  segments: string[];
  navigate: (path: string) => void;
  onManager: (context: RouteContext) => void;
};

function contentBlocks(value?: string) {
  return (value ?? "")
    .replaceAll("\\n", "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function CatalogView({
  segments,
  navigate,
  onManager,
}: CatalogViewProps) {
  const destination = destinationById(segments[1] ?? null);
  const service =
    destination?.services.find((entry) => entry.id === segments[2]) ?? null;
  const item = service?.children?.find((entry) => entry.id === segments[3]) ?? null;

  if (!destination) {
    return (
      <section className="page-stack" aria-labelledby="catalog-heading">
        <header className="page-heading">
          <span className="eyebrow">Каталог</span>
          <h1 id="catalog-heading">Все направления</h1>
          <p>Каждое направление открывается отдельным экраном внутри Mini App.</p>
        </header>
        <div className="card-list">
          {destinations.map((entry) => (
            <button
              className="catalog-card"
              key={entry.id}
              type="button"
              onClick={() => navigate(`services/${entry.id}`)}
            >
              <span className="catalog-icon">{entry.icon}</span>
              <span>
                <strong>{entry.name}</strong>
                <small>{entry.description}</small>
              </span>
              <i aria-hidden="true">→</i>
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (!service) {
    return (
      <section className="page-stack">
        <header className="page-heading">
          <button className="text-back" type="button" onClick={() => navigate("services")}>
            ← Все направления
          </button>
          <span className="eyebrow">{destination.eyebrow}</span>
          <h1>{destination.name}</h1>
          <p>{destination.description}</p>
        </header>
        <div className="card-list">
          {destination.services.map((entry) => (
            <button
              className="catalog-card"
              key={entry.id}
              type="button"
              onClick={() => navigate(`services/${destination.id}/${entry.id}`)}
            >
              <span className="catalog-icon">{entry.icon}</span>
              <span>
                <strong>{entry.name}</strong>
                <small>{entry.summary}</small>
                {entry.status === "soon" && <em>Скоро</em>}
              </span>
              <i aria-hidden="true">→</i>
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (!item && service.children?.length) {
    return (
      <section className="page-stack">
        <header className="page-heading">
          <button
            className="text-back"
            type="button"
            onClick={() => navigate(`services/${destination.id}`)}
          >
            ← {destination.name}
          </button>
          <span className="eyebrow">{destination.name}</span>
          <h1>{service.name}</h1>
          <p>{service.summary}</p>
        </header>
        <div className="card-list">
          {service.children.map((entry) => (
            <button
              className="catalog-card"
              key={entry.id}
              type="button"
              onClick={() =>
                navigate(`services/${destination.id}/${service.id}/${entry.id}`)
              }
            >
              <span className="catalog-icon">{entry.icon}</span>
              <span>
                <strong>{entry.name}</strong>
                <small>{entry.summary}</small>
                {entry.note && <b>{entry.note}</b>}
                {entry.status === "soon" && <em>Скоро</em>}
              </span>
              <i aria-hidden="true">→</i>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const detail = item ?? service;
  const parentPath = item
    ? `services/${destination.id}/${service.id}`
    : `services/${destination.id}`;

  return (
    <article className="page-stack detail-page">
      <header className="page-heading">
        <button className="text-back" type="button" onClick={() => navigate(parentPath)}>
          ← {item ? service.name : destination.name}
        </button>
        <span className="eyebrow">{destination.name}</span>
        <h1>{detail.name}</h1>
        <p>{detail.summary}</p>
        {detail.note && <strong className="price-note">{detail.note}</strong>}
      </header>

      {contentBlocks(detail.content).length ? (
        <div className="content-card">
          {contentBlocks(detail.content).map((block, index) => (
            <p key={`${detail.id}-${index}`}>{block}</p>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>Раздел готовится</strong>
          <p>Менеджер уже может помочь по этому направлению.</p>
        </div>
      )}

      <button
        className="button primary"
        type="button"
        onClick={() =>
          onManager({
            country: destination.name,
            section: service.name,
            service: detail.name,
          })
        }
      >
        Написать менеджеру
      </button>
    </article>
  );
}
