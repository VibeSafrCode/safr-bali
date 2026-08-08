import { activeDestinations, activeServices, destinationById } from "../catalog";
import type { RouteContext } from "../api/types";
import { locationHeaderTheme, serviceVisualForRoute } from "../countryThemes";
import { CountryGrid, ServiceGrid } from "./CatalogGrids";
import { CountryHeader } from "./CountryHeader";
import { ManagerContactCard } from "./ManagerContactCard";
import { VisaGrid } from "./VisaGrid";

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
  const location =
    destination && service
      ? locationHeaderTheme(destination.id, service.id)
      : null;
  const visibleChildren =
    service?.children?.filter(
      (entry) => !entry.publiclyHidden,
    ) ?? [];

  if (!destination) {
    return (
      <section className="page-stack" aria-labelledby="catalog-heading">
        <header className="page-heading">
          <span className="eyebrow">Каталог</span>
          <h1 id="catalog-heading">Все направления</h1>
          <p>Каждое направление открывается отдельным экраном внутри Mini App.</p>
        </header>
        <CountryGrid
          destinations={activeDestinations()}
          onSelect={(destinationId) => navigate(`services/${destinationId}`)}
        />
      </section>
    );
  }

  if (!service) {
    const services = activeServices(destination);
    const isPreparationDestination =
      services.length > 0 && services.every((entry) => entry.status === "soon");
    return (
      <section className="page-stack">
        <CountryHeader
          destination={destination}
          backLabel="Все направления"
          onBack={() => navigate("services")}
        />
        <header className="page-heading compact-page-heading">
          <h1>Чем помочь?</h1>
          <p>{destination.description}</p>
        </header>
        {services.length ? (
          <ServiceGrid
            destination={destination}
            services={services}
            onSelect={(serviceId) => navigate(`services/${destination.id}/${serviceId}`)}
          />
        ) : (
          <div className="empty-state">
            <strong>Активных услуг пока нет</strong>
            <p>Направление скрыто из общего выбора до появления доступных услуг.</p>
          </div>
        )}
        {isPreparationDestination && (
          <ManagerContactCard
            destination={destination}
            onContact={() =>
              onManager({ country: destination.name, section: "Направление" })
            }
          />
        )}
      </section>
    );
  }

  if (!item && visibleChildren.length) {
    return (
      <section className="page-stack">
        <CountryHeader
          destination={destination}
          context={location ? undefined : service.name}
          backLabel={destination.name}
          onBack={() => navigate(`services/${destination.id}`)}
          location={location}
        />
        <header className="page-heading compact-page-heading">
          <span className="eyebrow">{destination.name}</span>
          <h1>{service.name}</h1>
          <p>{service.summary}</p>
        </header>
        {service.id === "visas" ? (
          <div className="visa-catalog-layout">
            <VisaGrid
              visas={visibleChildren}
              onSelect={(entryId) =>
                navigate(`services/${destination.id}/${service.id}/${entryId}`)
              }
            />
            <aside className="visa-side-rail" aria-label="Помощь с визой">
              <div className="visa-process-card">
                <span className="eyebrow">Как начать</span>
                <strong>Выберите подходящую визу</strong>
                <p>Проверьте детали и передайте вопрос менеджеру в защищённом диалоге.</p>
              </div>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  onManager({ country: destination.name, section: service.name })
                }
              >
                Задать вопрос
              </button>
            </aside>
          </div>
        ) : (
          <div className={service.id === "exchange" ? "exchange-entry-list" : "card-list"}>
            {visibleChildren.map((entry) => (
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
        )}
      </section>
    );
  }

  const detail = item ?? service;
  const serviceVisual = serviceVisualForRoute(
    destination.id,
    service.id,
    item?.id,
  );
  const parentPath = item
    ? `services/${destination.id}/${service.id}`
    : `services/${destination.id}`;

  return (
    <article className="page-stack detail-page">
      <CountryHeader
        destination={destination}
        context={location ? item?.name : detail.name}
        backLabel={item ? service.name : destination.name}
        onBack={() => navigate(parentPath)}
        location={location}
      />
      <header className="page-heading compact-page-heading">
        <span className="eyebrow">{destination.name}</span>
        <h1>{detail.name}</h1>
        <p>{detail.summary}</p>
        {detail.note && <strong className="price-note">{detail.note}</strong>}
      </header>

      {serviceVisual && (
        <figure className="service-detail-photo">
          <img
            src={serviceVisual.src}
            srcSet={serviceVisual.srcSet}
            sizes="(max-width: 760px) calc(100vw - 32px), 720px"
            alt={serviceVisual.alt}
            style={{ objectPosition: serviceVisual.position }}
          />
        </figure>
      )}

      {detail.status === "soon" ? (
        <div className="empty-state preparation-state">
          <span className="eyebrow">Скоро</span>
          <strong>Услуга готовится к запуску</strong>
          <p>Менеджер уже может помочь с подготовкой и ответить на вопросы.</p>
        </div>
      ) : contentBlocks(detail.content).length ? (
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
