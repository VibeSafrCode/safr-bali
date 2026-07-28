import type { Metadata } from "next";

import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { StaticLink } from "../components/StaticLink";

export const metadata: Metadata = {
  title: "Страница не найдена",
  description: "Запрошенная страница SAFRWAY не существует.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFoundPage() {
  return (
    <main className="service-page">
      <SiteHeader />
      <section className="service-page-content">
        <span className="eyebrow">Ошибка 404</span>
        <h1>Страница не найдена</h1>
        <p className="service-page-lead">
          Возможно, адрес изменился или в ссылке есть опечатка. Выберите
          направление заново — все доступные услуги остаются внутри сайта.
        </p>
        <div className="hero-actions">
          <StaticLink className="button button-primary" href="/">
            На главную
          </StaticLink>
          <StaticLink className="button button-secondary" href="/directions">
            Все направления
          </StaticLink>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
