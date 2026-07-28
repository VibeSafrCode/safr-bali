import { destinations } from "../lib/catalog";

const MANAGER_URL = "https://t.me/safr_bali_bot";

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

function readableContent(value: string) {
  return value.replaceAll("\\n", "\n");
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="SAFR — на главную">
          <span className="brand-mark">S</span>
          <span>SAFR</span>
        </a>
        <nav className="desktop-nav" aria-label="Основная навигация">
          <a href="#directions">Направления</a>
          <a href="#approach">Как мы работаем</a>
          <a href="#club">SAFR Club</a>
        </nav>
        <a className="header-cta" href="#directions">
          Каталог услуг <span aria-hidden="true">↓</span>
        </a>
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
          <a className="button button-primary" href="#directions">
            Выбрать направление <span aria-hidden="true">↓</span>
          </a>
          <a className="button button-ghost" href={MANAGER_URL} target="_blank" rel="noreferrer">
            Написать менеджеру
          </a>
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
              <a
                className="destination-link"
                href={`#catalog-${destination.id}`}
                aria-label={`Посмотреть услуги направления ${destination.name}`}
              >
                Посмотреть услуги <span aria-hidden="true">↓</span>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="section service-catalog" id="services">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Архитектура услуг</span>
            <h2>Всё, что уже есть в боте</h2>
          </div>
          <p>
            Сайт и Mini App используют одно дерево направлений. Новые страны,
            города и услуги можно добавлять без перестройки интерфейса.
          </p>
        </div>

        <div className="catalog-destinations">
          {destinations.map((destination) => (
            <article
              className="catalog-destination"
              id={`catalog-${destination.id}`}
              key={destination.id}
            >
              <header>
                <span>{destination.number}</span>
                <div>
                  <small>{destination.eyebrow}</small>
                  <h3>{destination.name}</h3>
                </div>
              </header>
              <div className="catalog-services">
                {destination.services.map((service) => (
                  <details key={service.id}>
                    <summary>
                      <span className="catalog-icon">{service.icon}</span>
                      <span>
                        <strong>{service.name}</strong>
                        <small>{service.summary}</small>
                      </span>
                      {service.status === "soon" && <em>Скоро</em>}
                    </summary>
                    <div className="catalog-detail">
                      {service.note && <p>{service.note}</p>}
                      {service.children?.length ? (
                        <div className="catalog-items">
                          {service.children.map((item) => (
                            <details
                              className="catalog-item"
                              id={`${destination.id}-${service.id}-${item.id}`}
                              key={item.id}
                            >
                              <summary>
                                <span>{item.icon}</span>
                                <div>
                                  <strong>{item.name}</strong>
                                  <small>{item.summary}</small>
                                </div>
                                {item.status === "soon" && <em>Скоро</em>}
                              </summary>
                              <div className="catalog-item-content">
                                {item.note && <strong>{item.note}</strong>}
                                {item.content ? (
                                  <p>{readableContent(item.content)}</p>
                                ) : (
                                  <p>
                                    Информацию скоро добавим. Уже сейчас можно
                                    получить консультацию у менеджера.
                                  </p>
                                )}
                              </div>
                            </details>
                          ))}
                        </div>
                      ) : (
                        <>
                          {service.content && (
                            <p className="catalog-long-text">
                              {readableContent(service.content)}
                            </p>
                          )}
                          {!service.content && (
                            <p>
                              {service.status === "soon"
                                ? "Информацию скоро добавим. Консультацию уже можно получить у менеджера."
                                : "Услуга доступна — детали и сроки уточнит менеджер."}
                            </p>
                          )}
                        </>
                      )}
                      <a href={MANAGER_URL} target="_blank" rel="noreferrer">
                        Написать менеджеру <span aria-hidden="true">↗</span>
                      </a>
                    </div>
                  </details>
                ))}
              </div>
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
            <a className="button button-light" href="/mini-app">
              Открыть личный кабинет <span aria-hidden="true">→</span>
            </a>
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
        <a className="button button-primary" href="#directions">
          Открыть каталог <span aria-hidden="true">↑</span>
        </a>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark">S</span>
          <span>SAFR</span>
        </a>
        <p>Путешествия, релокация и проверенные услуги в разных странах.</p>
        <div className="footer-links">
          <a href="/privacy">Конфиденциальность</a>
          <a href="/mini-app">Личный кабинет</a>
        </div>
        <span className="copyright">© 2026 SAFR</span>
      </footer>
    </main>
  );
}
