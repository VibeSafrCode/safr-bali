import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { StaticLink } from "../../components/StaticLink";
import { destinations } from "../../lib/catalog";

export const metadata: Metadata = {
  title: "Направления",
  description:
    "Услуги SAFR на Бали, в Таиланде, России и Непале: отдельные каталоги стран и подробные страницы услуг.",
  alternates: {
    canonical: "/catalog/",
  },
};

export default function DirectionsPage() {
  return (
    <main className="directions-index">
      <SiteHeader />
      <section className="directions-index-intro">
        <span className="eyebrow">Каталог SAFR</span>
        <h1>Выберите направление</h1>
        <p>
          У каждой страны собственные услуги, команда и подробные страницы.
          Профиль и реферальная связь остаются общими.
        </p>
      </section>
      <section className="destination-grid directions-index-grid">
        {destinations.map((destination) => (
          <StaticLink
            className={`destination-card ${destination.className}`}
            href={`/${destination.id}`}
            key={destination.id}
            aria-label={`Открыть направление ${destination.name}`}
          >
            <div className="destination-topline">
              <span>{destination.number}</span>
              <span>{destination.eyebrow}</span>
            </div>
            <div className="destination-content">
              <h2>{destination.name}</h2>
              <p>{destination.description}</p>
              <div className="service-tags">
                {destination.services.map((service) => (
                  <span key={service.id}>{service.name}</span>
                ))}
              </div>
            </div>
            <span className="destination-link">
              Открыть направление <span aria-hidden="true">→</span>
            </span>
          </StaticLink>
        ))}
      </section>
      <SiteFooter />
    </main>
  );
}
