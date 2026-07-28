import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { StaticLink } from "../../../components/StaticLink";
import { destinations, destinationById } from "../../../lib/catalog";

export function generateStaticParams() {
  return destinations.map((destination) => ({
    destinationId: destination.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ destinationId: string }>;
}): Promise<Metadata> {
  const { destinationId } = await params;
  const destination = destinationById(destinationId);
  if (!destination) return {};

  return {
    title: destination.name,
    description: destination.description,
    alternates: {
      canonical: `/directions/${destination.id}/`,
    },
  };
}

export default async function DestinationPage({
  params,
}: {
  params: Promise<{ destinationId: string }>;
}) {
  const { destinationId } = await params;
  const destination = destinationById(destinationId);
  if (!destination) notFound();

  return (
    <main className={`catalog-page ${destination.className}`}>
      <SiteHeader />
      <section className="catalog-page-hero">
        <StaticLink className="catalog-back-link" href="/directions">
          ← Все направления
        </StaticLink>
        <span>{destination.eyebrow}</span>
        <h1>{destination.name}</h1>
        <p>{destination.description}</p>
      </section>
      <section className="catalog-page-list">
        <div>
          <span className="eyebrow">Услуги</span>
          <h2>Выберите нужный раздел</h2>
        </div>
        <div className="route-cards">
          {destination.services.map((service) => (
            <StaticLink
              href={`/directions/${destination.id}/${service.id}`}
              key={service.id}
            >
              <span className="catalog-icon">{service.icon}</span>
              <div>
                <strong>{service.name}</strong>
                <p>{service.summary}</p>
                {service.note && <small>{service.note}</small>}
              </div>
              {service.status === "soon" ? <em>Скоро</em> : <b>→</b>}
            </StaticLink>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
