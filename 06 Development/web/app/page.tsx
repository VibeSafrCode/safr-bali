const BOT_URL = "https://t.me/safr_bali_bot";

const destinations = [
  {
    id: "bali",
    number: "01",
    name: "Бали",
    eyebrow: "Жить, отдыхать, переехать",
    description:
      "Визы, виллы, трансферы, обмен валюты и человек на месте, который проверит детали за вас.",
    services: ["Визы", "Жильё", "Обмен", "Трансфер"],
    className: "destination-bali",
  },
  {
    id: "thailand",
    number: "02",
    name: "Таиланд",
    eyebrow: "Скоро больше услуг",
    description:
      "Обмен, визовые вопросы, недвижимость и яхты — собираем команду проверенных специалистов.",
    services: ["Обмен", "Визы", "Недвижимость", "Яхты"],
    className: "destination-thailand",
  },
  {
    id: "russia",
    number: "03",
    name: "Россия",
    eyebrow: "Петербург · Урал · Кавказ",
    description:
      "SUP-туры, прогулки на катере, сплавы, ретриты и живые маршруты с локальными гидами.",
    services: ["Петербург", "Урал", "Кавказ"],
    className: "destination-russia",
  },
  {
    id: "nepal",
    number: "04",
    name: "Непал",
    eyebrow: "Трекинг и экспедиции",
    description:
      "Кайлас, Эверест и Аннапурна: гиды, трансферы и жильё для путешествия, к которому готовятся серьёзно.",
    services: ["Кайлас", "Эверест", "Аннапурна", "Гид"],
    className: "destination-nepal",
  },
] as const;

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

function telegramLink(direction?: string) {
  return direction ? `${BOT_URL}?start=${direction}` : BOT_URL;
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
        <a className="header-cta" href={telegramLink()} target="_blank" rel="noreferrer">
          Открыть в Telegram <span aria-hidden="true">↗</span>
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
          <a className="button button-ghost" href={telegramLink()} target="_blank" rel="noreferrer">
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
                    <span key={service}>{service}</span>
                  ))}
                </div>
              </div>
              <a
                className="destination-link"
                href={telegramLink(destination.id)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Открыть направление ${destination.name} в Telegram`}
              >
                Открыть направление <span aria-hidden="true">↗</span>
              </a>
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
        <span className="eyebrow">Начнём с одного сообщения</span>
        <h2>
          Расскажите, куда вы едете
          <br />
          и что хотите решить
        </h2>
        <a className="button button-primary" href={telegramLink()} target="_blank" rel="noreferrer">
          Написать в Telegram <span aria-hidden="true">↗</span>
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
          <a href={telegramLink()} target="_blank" rel="noreferrer">Telegram</a>
        </div>
        <span className="copyright">© 2026 SAFR</span>
      </footer>
    </main>
  );
}
