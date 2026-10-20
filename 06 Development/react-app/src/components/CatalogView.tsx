import {presentationCopy} from '../ui/presentation-copy';
import {miniAppAssetPath,YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {HomeView} from './HomeView';
import {InsuranceOptions} from './InsuranceOptions';
import {useEffect} from 'react';
import {selectWorld} from './DestinationDesign';
import {VisaPlanner} from './VisaPlanner';
import { activeDestinations, activeServices, canonicalCatalogItemName, canonicalDestinationName, destinationById } from "../catalog";
import type { RouteContext } from "../api/types";
import { locationHeaderTheme, serviceVisualForRoute } from "../countryThemes";
import { CountryGrid, ServiceGrid } from "./CatalogGrids";
import { CountryHeader } from "./CountryHeader";
import { ManagerContactCard } from "./ManagerContactCard";
import { VisaGrid } from "./VisaGrid";
import { useI18n } from "../i18n/runtime";
import { compactPriceLabel, usePricing, visaEntityKeyByCatalogId } from "../pricing/runtime";
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import {clientActiveDestinations,clientActiveServicesById} from '../i18n/client-card-destination';
import {clientCompactPriceLabels} from '../i18n/client-catalog-journey';
import {ClientVisaDetail} from './ClientVisaDetail';

type CatalogViewProps = {
  segments: string[];
  navigate: (path: string) => void;
  onManager: (context: RouteContext) => void;
  ui?:ClientUiBindings;
};

function contentBlocks(value?: string) {
  return (value ?? "")
    .replaceAll("\\n", "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function withoutLegacyCommercialContent(
  serviceId: string,
  itemId: string | undefined,
  value: string | undefined,
) {
  let normalized = (value ?? "").replaceAll("\\n", "\n");
  const markers: Record<string, Array<[string, string]>> = {
    e33g: [["Стоимость под ключ", "Для подачи:"], ["All-inclusive price", "Documents required:"]],
    d12: [["Стоимость под ключ на 1 год", "Для подачи:"], ["All-inclusive price for 1 year", "Documents required:"]],
    "d1-d2": [["Все указанные цены", "Для подачи:"], ["All listed prices", "Documents required:"]],
    c1: [["Стоимость оформления SAFR:", "Для подачи:"], ["SAFR processing price:", "Documents required:"]],
    voa: [["Стоимость оформления SAFR:", "Для оформления:"], ["SAFR processing price:", "Documents required:"]],
  };
  const pairs = serviceId === "visas" && itemId
    ? markers[itemId] ?? []
    : serviceId === "housing"
      ? [["💰 СТОИМОСТЬ", "🛎 ДОПОЛНИТЕЛЬНЫЙ КОНСЬЕРЖ-СЕРВИС"], ["💰 PRICE", "🛎 OPTIONAL CONCIERGE SERVICE"]] as Array<[string, string]>
      : [];
  for (const [start, end] of pairs) {
    const startIndex = normalized.indexOf(start);
    const endIndex = startIndex < 0 ? -1 : normalized.indexOf(end, startIndex + start.length);
    if (startIndex >= 0 && endIndex >= 0) {
      normalized = `${normalized.slice(0, startIndex)}${normalized.slice(endIndex)}`;
      break;
    }
  }
  return normalized;
}

function guideContentSections(value?: string) {
  return contentBlocks(value).map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const heading = lines[0] ?? "";
    const hasHeading = /[:：]$/.test(heading) || /^\d+\./.test(heading);
    const content = hasHeading ? lines.slice(1) : lines;
    return {
      heading: hasHeading ? heading.replace(/[:：]$/, "") : undefined,
      bullets: content.filter((line) => /^-\s+/.test(line)).map((line) => line.replace(/^-\s+/, "")),
      paragraphs: content.filter((line) => !/^-\s+/.test(line)),
    };
  });
}

function GuideText({ value }: { value: string }) {
  const url = /^https:\/\/\S+$/.test(value) ? value : null;
  return url ? <a href={url} target="_blank" rel="noreferrer">{url}</a> : value;
}

export function CatalogView({
  segments,
  navigate,
  onManager,
  ui,
}: CatalogViewProps) {
  const { locale, t:legacyText } = useI18n();
  const client=YOGA_MINI_APP||ui===undefined?undefined:requireClientUiBindings(ui),t=client?.text??legacyText;
  const price=(entity:'VISA'|'SERVICE',key:string)=>compactPriceLabel(projection,entity,key,locale,client?clientCompactPriceLabels(client):undefined);
  const { projection } = usePricing();
  const destination = client?clientActiveDestinations(client.locale).find(d=>d.id===segments[1])??null:destinationById(segments[1] ?? null, locale);
  const active=destination?(client?clientActiveServicesById(destination.id,client.locale):activeServices(destination,locale)):[];
  useEffect(()=>{if(destination)selectWorld(destination.id);},[destination?.id]);
  const service =
    active.find((entry) => entry.id === segments[2]) ?? null;
  const item = service?.children?.find((entry) => entry.id === segments[3] && (!client || !entry.publiclyHidden)) ?? null;
  const location =
    destination && service
      ? locationHeaderTheme(destination.id, service.id, locale)
      : null;
  const visibleChildren =
    service?.children?.filter(
      (entry) => !entry.publiclyHidden,
    ) ?? [];

  if (!destination) return <HomeView ui={client} navigate={navigate} onManager={onManager} pointsBalance={0}/>;

  if (!service) {
    const services = active;
    const isPreparationDestination =
      services.length > 0 && services.every((entry) => entry.status === "soon");
    return (
      <section className="page-stack" lang={client?.locale} dir={client?.dir}>
        <CountryHeader
          ui={client}
          destination={destination}
          backLabel={t("catalog.backAllDestinations")}
          onBack={() => navigate("home")}
        />
        <header className="page-heading compact-page-heading">
          <h1>{destination.name}</h1>
        </header>
        {services.length ? (
          <ServiceGrid
            ui={client}
            destination={destination}
            services={services}
            onSelect={(serviceId) => navigate(`services/${destination.id}/${serviceId}`)}
          />
        ) : (
          <div className="empty-state">
            <strong>{t("catalog.noServices.title")}</strong>
            <p>{t("catalog.noServices.detail")}</p>
          </div>
        )}
        {isPreparationDestination && (
          <ManagerContactCard
            ui={client}
            destination={destination}
            onContact={() =>
              onManager({ country: canonicalDestinationName(destination.id), section: "Направление" })
            }
          />
        )}
      </section>
    );
  }

  if (!item && visibleChildren.length) {
    return (
      <section className="page-stack" lang={client?.locale} dir={client?.dir}>
        <CountryHeader
          ui={client}
          destination={destination}
          context={location ? undefined : service.name}
          backLabel={destination.name}
          onBack={() => navigate(`services/${destination.id}`)}
          location={location}
        />
        {service.id!=="visas"&&<header className="page-heading compact-page-heading">
          <span className="eyebrow">{destination.name}</span>
          <h1>{service.name}</h1>
          <p>{service.summary}</p>
        </header>}
        {service.id === "visas" ? (
          <VisaPlanner ui={client} onManager={onManager} onRequests={()=>navigate("visas")}><div className="visa-catalog-layout">
            <VisaGrid
              ui={client}
              visas={visibleChildren}
              onSelect={(entryId) =>
                navigate(`services/${destination.id}/${service.id}/${entryId}`)
              }
            />
            <aside className="visa-side-rail" aria-label={t("catalog.visaHelpAria")}>
              <div className="visa-process-card">
                <span className="eyebrow">{t("catalog.visaStart.eyebrow")}</span>
                <strong>{t("catalog.visaStart.title")}</strong>
                <p>{t("catalog.visaStart.detail")}</p>
              </div>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  onManager({
                    country: canonicalDestinationName(destination.id),
                    section: canonicalCatalogItemName(destination.id, service.id),
                  })
                }
              >
                {t("catalog.askQuestion")}
              </button>
            </aside>
          </div></VisaPlanner>
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
                  {service.id === "housing"
                    ? price("SERVICE", "housing") && <b>{price("SERVICE", "housing")}</b>
                    : service.id === "guides" && entry.id === "all-indonesia"
                      ? price("SERVICE", "all-indonesia-assistance") && <b>{price("SERVICE", "all-indonesia-assistance")}</b>
                    : entry.note && <b>{entry.note}</b>}
                  {entry.status === "soon" && <em>{t("catalog.soon")}</em>}
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
    locale,
  );
  const parentPath = item
    ? `services/${destination.id}/${service.id}`
    : `services/${destination.id}`;
  const runtimePrice = service.id === "visas" && item
    ? price("VISA", visaEntityKeyByCatalogId[item.id] ?? "")
    : service.id === "housing" && (!item || item.id === "villa")
      ? price("SERVICE", "housing")
      : service.id === "guides" && item?.id === "all-indonesia"
        ? price("SERVICE", "all-indonesia-assistance")
      : null;
  const runtimeContent = client?detail.content:presentationCopy(withoutLegacyCommercialContent(service.id, item?.id, detail.content));
  const fullVisa=client&&destination.id==='bali'&&service.id==='visas'&&item&&['e33g','d12','d1-d2','c1','voa'].includes(item.id);

  return (
    <article className={`page-stack detail-page${detail.download ? " guide-detail-page" : ""}`} lang={client?.locale} dir={client?.dir}>
      <CountryHeader
        ui={client}
        destination={destination}
        context={location ? item?.name : detail.name}
        backLabel={item ? service.name : destination.name}
        onBack={() => navigate(parentPath)}
        location={location}
      />
      {fullVisa ? <ClientVisaDetail visaId={item.id} ui={client!} destinationName={destination.name} summary={detail.summary} price={runtimePrice} preparing={detail.status==='soon'}/> : <><header className="page-heading compact-page-heading">
        <span className="eyebrow">{destination.name}</span>
        <h1>{detail.name}</h1>
        <p>{detail.summary}</p>
        {runtimePrice && <strong className="price-note">{runtimePrice}</strong>}
      </header>

      {detail.download && (
        <section className="guide-download-card" aria-labelledby="guide-download-title">
          <div>
            <span className="eyebrow">{detail.download.meta}</span>
            <h2 id="guide-download-title">{detail.download.label}</h2>
            <p>{detail.download.recommendation}</p>
          </div>
          <a
            className="button primary"
            href={miniAppAssetPath(detail.download.href)}
            download={detail.download.fileName}
            type={detail.download.mediaType}
            hrefLang={detail.download.language}
            target="_blank"
            rel="noreferrer"
          >
            {detail.download.label}
          </a>
        </section>
      )}

      {serviceVisual && (
        <figure className="service-detail-photo">
          <img
            src={serviceVisual.src}
            srcSet={serviceVisual.srcSet}
            sizes="(max-width: 760px) calc(100vw - 32px), 720px"
            alt={client?client.text(destination.id==='bali'?'theme.baliVilla.heroAlt':'theme.spbBoat.heroAlt'):serviceVisual.alt}
            style={{ objectPosition: serviceVisual.position }}
          />
        </figure>
      )}

      {client&&detail.status==='soon'&&(service.id==='insurance'||runtimeContent)&&<div className="empty-state preparation-state"><span className="eyebrow">{t('catalog.soon')}</span><strong>{t('catalog.preparing.title')}</strong><p>{t('catalog.preparing.detail')}</p></div>}
      {service.id === "insurance" ? <InsuranceOptions ui={client} locale={locale} onContact={brand => onManager({country:canonicalDestinationName(destination.id),section:"Страховки",service:brand})} /> : client&&runtimeContent&&!detail.download ? <div className="content-card client-source-content">{runtimeContent}</div> : detail.status === "soon" ? (
        <div className="empty-state preparation-state">
          <span className="eyebrow">{t("catalog.soon")}</span>
          <strong>{t("catalog.preparing.title")}</strong>
          <p>{t("catalog.preparing.detail")}</p>
        </div>
      ) : detail.download && guideContentSections(runtimeContent).length ? (
        <div className="content-card guide-content-card">
          {guideContentSections(runtimeContent).map((section, index) => (
            <section key={`${detail.id}-${index}`}>
              {section.heading && <h2>{section.heading}</h2>}
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}><GuideText value={paragraph} /></p>
              ))}
              {section.bullets.length > 0 && (
                <ul>
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : contentBlocks(runtimeContent).length ? (
        <div className="content-card">
          {contentBlocks(runtimeContent).map((block, index) => <p key={`${detail.id}-${index}`}>{block}</p>)}
        </div>
      ) : (
        <div className="empty-state">
          <strong>{t("catalog.sectionPreparing.title")}</strong>
          <p>{t("catalog.sectionPreparing.detail")}</p>
        </div>
      )}</>}

      {service.id !== "insurance" && <button
        className="button primary"
        type="button"
        onClick={() =>
          onManager({
            country: canonicalDestinationName(destination.id),
            section: canonicalCatalogItemName(destination.id, service.id==='bikes'?'assistant':service.id),
            service: canonicalCatalogItemName(destination.id, service.id, item?.id),
          })
        }
      >
        {t("catalog.writeManager")}
      </button>}
    </article>
  );
}
