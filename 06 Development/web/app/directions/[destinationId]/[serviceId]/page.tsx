import Link from "next/link";
import { notFound } from "next/navigation";
import { ManagerButton } from "../../../../components/ManagerButton";
import {
  destinationById,
  destinations,
  routeContextFor,
  serviceById,
} from "../../../../lib/catalog";

export function generateStaticParams() {
  return destinations.flatMap((destination) =>
    destination.services.map((service) => ({
      destinationId: destination.id,
      serviceId: service.id,
    })),
  );
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ destinationId: string; serviceId: string }>;
}) {
  const { destinationId, serviceId } = await params;
  const destination = destinationById(destinationId);
  const service = serviceById(destinationId, serviceId);
  if (!destination || !service) notFound();

  return (
    <main className="service-page">
      <header className="catalog-page-header">
        <Link className="brand" href="/">
          <span className="brand-mark">S</span>
          <span>SAFR</span>
        </Link>
        <Link href="/account">Личный кабинет</Link>
      </header>
      <section className="service-page-content">
        <Link className="catalog-back-link" href={`/directions/${destination.id}`}>
          ← {destination.name}
        </Link>
        <span className={`service-page-icon ${destination.color}`}>{service.icon}</span>
        <h1>{service.name}</h1>
        <p className="service-page-lead">{service.summary}</p>
        {service.note && <strong className="service-page-note">{service.note}</strong>}

        {service.children?.length ? (
          <div className="route-cards service-children">
            {service.children.map((item) => (
              <Link
                href={`/directions/${destination.id}/${service.id}/${item.id}`}
                key={item.id}
              >
                <span className="catalog-icon">{item.icon}</span>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.summary}</p>
                  {item.note && <small>{item.note}</small>}
                </div>
                {item.status === "soon" ? <em>Скоро</em> : <b>→</b>}
              </Link>
            ))}
          </div>
        ) : (
          <article className="service-copy">
            <p>
              {service.content?.replaceAll("\\n", "\n") ??
                "Информацию скоро добавим. Уже сейчас можно получить консультацию у менеджера."}
            </p>
          </article>
        )}

        <ManagerButton
          className="button button-primary service-manager"
          context={routeContextFor(destination, service)}
        >
          Написать менеджеру
        </ManagerButton>
      </section>
    </main>
  );
}
