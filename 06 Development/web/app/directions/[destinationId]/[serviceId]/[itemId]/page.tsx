import { notFound } from "next/navigation";
import { ManagerButton } from "../../../../../components/ManagerButton";
import { SiteFooter } from "../../../../../components/SiteFooter";
import { SiteHeader } from "../../../../../components/SiteHeader";
import { StaticLink } from "../../../../../components/StaticLink";
import {
  destinationById,
  destinations,
  itemById,
  routeContextFor,
  serviceById,
} from "../../../../../lib/catalog";

export function generateStaticParams() {
  return destinations.flatMap((destination) =>
    destination.services.flatMap((service) =>
      (service.children ?? []).map((item) => ({
        destinationId: destination.id,
        serviceId: service.id,
        itemId: item.id,
      })),
    ),
  );
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{
    destinationId: string;
    serviceId: string;
    itemId: string;
  }>;
}) {
  const { destinationId, serviceId, itemId } = await params;
  const destination = destinationById(destinationId);
  const service = serviceById(destinationId, serviceId);
  const item = itemById(destinationId, serviceId, itemId);
  if (!destination || !service || !item) notFound();

  return (
    <main className="service-page">
      <SiteHeader />
      <section className="service-page-content">
        <StaticLink
          className="catalog-back-link"
          href={`/directions/${destination.id}/${service.id}`}
        >
          ← {service.name}
        </StaticLink>
        <span className={`service-page-icon ${destination.color}`}>{item.icon}</span>
        <h1>{item.name}</h1>
        <p className="service-page-lead">{item.summary}</p>
        {item.note && <strong className="service-page-note">{item.note}</strong>}
        <article className="service-copy">
          <p>
            {item.content?.replaceAll("\\n", "\n") ??
              "Информацию скоро добавим. Уже сейчас можно получить консультацию у менеджера."}
          </p>
        </article>
        <ManagerButton
          className="button button-primary service-manager"
          context={routeContextFor(destination, service, item)}
        >
          Написать менеджеру
        </ManagerButton>
      </section>
      <SiteFooter />
    </main>
  );
}
