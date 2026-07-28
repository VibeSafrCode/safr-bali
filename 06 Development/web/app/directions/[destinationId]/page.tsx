import Link from "next/link";
import { notFound } from "next/navigation";
import { destinations, destinationById } from "../../../lib/catalog";

export function generateStaticParams() {
  return destinations.map((destination) => ({
    destinationId: destination.id,
  }));
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
      <header className="catalog-page-header">
        <Link className="brand" href="/">
          <span className="brand-mark">S</span>
          <span>SAFR</span>
        </Link>
        <Link href="/account">Личный кабинет</Link>
      </header>
      <section className="catalog-page-hero">
        <Link className="catalog-back-link" href="/directions">← Все направления</Link>
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
            <Link
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
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
