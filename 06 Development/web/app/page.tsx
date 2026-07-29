import type { Metadata } from "next";
import { ManagerButton } from "../components/ManagerButton";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { StaticLink } from "../components/StaticLink";
import { destinations } from "../lib/catalog";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return (
    <main className="home-portal">
      <SiteHeader />

      <section className="hero">
        <div className="hero-kicker">
          <span className="status-dot" />
          Ваш человек в другой стране
        </div>
        <h1>
          Путешествия и жизнь
          <br />
          <em>без лишнего хаоса</em>
        </h1>
        <p className="hero-copy">
          Выберите страну, затем нужную услугу. У каждого направления собственная
          страница, каталог и команда.
        </p>
        <div className="hero-actions">
          <StaticLink className="button button-primary" href="/directions">
            Открыть направления <span aria-hidden="true">→</span>
          </StaticLink>
          <ManagerButton className="button button-ghost">
            Написать менеджеру
          </ManagerButton>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <span className="orbit-line orbit-one" />
          <span className="orbit-line orbit-two" />
          <span className="orbit-label label-bali">Бали</span>
          <span className="orbit-label label-nepal">Непал</span>
          <span className="orbit-label label-russia">Россия</span>
          <span className="orbit-label label-thailand">Таиланд</span>
          <span className="orbit-center">S</span>
        </div>
      </section>

      <section className="home-directions">
        <div className="home-directions-heading">
          <span className="eyebrow">Каталог SAFR</span>
          <h2>Выберите направление</h2>
          <p>Дальше откроется отдельная страница страны с её услугами.</p>
        </div>
        <div className="destination-grid">
          {destinations.map((destination) => (
            <StaticLink
              className={`destination-card ${destination.className}`}
              href={`/directions/${destination.id}`}
              key={destination.id}
              aria-label={`Открыть направление ${destination.name}`}
            >
              <div className="destination-topline">
                <span>{destination.number}</span>
                <span>{destination.eyebrow}</span>
              </div>
              <div className="destination-content">
                <h3>{destination.name}</h3>
                <p>{destination.description}</p>
              </div>
              <span className="destination-link">
                Открыть страницу <span aria-hidden="true">→</span>
              </span>
            </StaticLink>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
