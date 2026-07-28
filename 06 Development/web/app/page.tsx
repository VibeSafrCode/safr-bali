import Link from "next/link";
import { destinations } from "../lib/catalog";
import { ManagerButton } from "../components/ManagerButton";

const principles = [
  {
    number: "01",
    title: "Сначала разбираемся",
    text: "Слушаем задачу, задаём правильные вопросы и предлагаем только то, что подходит вам.",
  },
  {
    number: "02",
    title: "Проверяем на месте",
    text: "Работаем с локальными специалистами и показываем реальную картину без рекламных фильтров.",
  },
  {
    number: "03",
    title: "Остаёмся на связи",
    text: "Не исчезаем после оплаты: ведём задачу до результата и помогаем, если планы меняются.",
  },
] as const;

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="SAFR — на главную">
          <span className="brand-mark">S</span>
          <span>SAFR</span>
        </Link>
        <nav className="desktop-nav" aria-label="Основная навигация">
          <Link href="/directions">Направления</Link>
          <Link href="/account">SAFR Club</Link>
          <Link href="/privacy">Документы</Link>
        </nav>
        <Link className="header-cta" href="/directions">
          Каталог услуг <span aria-hidden="true">↓</span>
        </Link>
      </header>

      <section className="hero" id="top">
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
          Визы, жильё, туры и бытовые задачи — в одном месте. Разбираемся в деталях,
          проверяем на месте и остаёмся рядом до результата.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/directions">
            Выбрать направление <span aria-hidden="true">↓</span>
          </Link>
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
        <div className="hero-proof">
          <div>
            <strong>4</strong>
            <span>направления</span>
          </div>
          <div>
            <strong>1</strong>
            <span>единый кабинет</span>
          </div>
          <div>
            <strong>24/7</strong>
            <span>связь в Telegram</span>
          </div>
        </div>
      </section>

      <section className="section directions" id="directions">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Куда отправимся</span>
            <h2>Выберите направление</h2>
          </div>
          <p>
            Каждая страна — отдельная команда и набор услуг. Ваш профиль, история и
            реферальная связь остаются общими.
          </p>
        </div>
        <div className="destination-grid">
          {destinations.map((destination) => (
            <article className={`destination-card ${destination.className}`} key={destination.id}>
              <div className="destination-topline">
                <span>{destination.number}</span>
                <span>{destination.eyebrow}</span>
              </div>
              <div className="destination-content">
                <h3>{destination.name}</h3>
                <p>{destination.description}</p>
                <div className="service-tags">
                  {destination.services.map((service) => (
                    <span key={service.id}>{service.name}</span>
                  ))}
                </div>
              </div>
              <Link
                className="destination-link"
                href={`/directions/${destination.id}`}
                aria-label={`Посмотреть услуги направления ${destination.name}`}
              >
                Открыть направление <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section approach" id="approach">
        <div className="approach-intro">
          <span className="eyebrow">Подход SAFR</span>
          <h2>
            Не агрегатор.
            <br />
            <em>Живые люди на месте.</em>
          </h2>
          <p>
            Мы не оставляем вас один на один с каталогом. За каждой заявкой стоит
            менеджер, который знает направление и отвечает за результат.
          </p>
        </div>
        <div className="principles">
          {principles.map((principle) => (
            <article key={principle.number}>
              <span>{principle.number}</span>
              <h3>{principle.title}</h3>
              <p>{principle.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="club-section" id="club">
        <div className="club-card">
          <div className="club-copy">
            <span className="eyebrow">Один аккаунт для всех стран</span>
            <h2>SAFR Club</h2>
            <p>
              Копите SAFR Points, следите за заявками и приглашайте друзей. Если ваш
              человек позже закажет услугу в другой стране, реферальная связь сохранится.
            </p>
            <Link className="button button-light" href="/account">
              Открыть личный кабинет <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="club-preview" aria-label="Пример личного кабинета SAFR">
            <div className="preview-bar">
              <span>SAFR Club</span>
              <span className="mini-avatar">Н</span>
            </div>
            <div className="balance-card">
              <span>Ваш баланс</span>
              <strong>2 450</strong>
              <small>SAFR Points</small>
            </div>
            <div className="preview-row">
              <span>Моя сеть</span>
              <strong>8 человек</strong>
            </div>
            <div className="preview-row">
              <span>Заявки</span>
              <strong>2 активные</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="closing">
        <span className="eyebrow">Все направления в одном каталоге</span>
        <h2>
          Выберите страну и услугу
          <br />
          без перехода в другой интерфейс
        </h2>
        <Link className="button button-primary" href="/directions">
          Открыть каталог <span aria-hidden="true">→</span>
        </Link>
      </section>

      <footer>
        <Link className="brand footer-brand" href="/">
          <span className="brand-mark">S</span>
          <span>SAFR</span>
        </Link>
        <p>Путешествия, релокация и проверенные услуги в разных странах.</p>
        <div className="footer-links">
          <Link href="/privacy">Конфиденциальность</Link>
          <Link href="/account">Личный кабинет</Link>
        </div>
        <span className="copyright">© 2026 SAFR</span>
      </footer>
    </main>
  );
}
