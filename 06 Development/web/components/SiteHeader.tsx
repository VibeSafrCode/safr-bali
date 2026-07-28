import { StaticLink } from "./StaticLink";

export function SiteHeader() {
  return (
    <header className="site-header">
      <StaticLink className="brand" href="/" aria-label="SAFR — на главную">
        <span className="brand-mark">S</span>
        <span>SAFR</span>
      </StaticLink>
      <nav className="desktop-nav" aria-label="Основная навигация">
        <StaticLink href="/">Главная</StaticLink>
        <StaticLink href="/directions">Направления</StaticLink>
        <StaticLink href="/account">Личный кабинет</StaticLink>
        <StaticLink href="/privacy">Документы</StaticLink>
      </nav>
      <StaticLink className="header-cta" href="/directions">
        Каталог услуг <span aria-hidden="true">→</span>
      </StaticLink>
    </header>
  );
}
