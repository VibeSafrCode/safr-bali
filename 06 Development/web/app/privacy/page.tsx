import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="brand" href="/">
        <span className="brand-mark">S</span>
        <span>SAFR</span>
      </Link>
      <article>
        <span className="eyebrow">Документы</span>
        <h1>Политика конфиденциальности</h1>
        <p className="legal-date">Обновлено 27 июля 2026 года</p>
        <h2>Какие данные мы используем</h2>
        <p>
          При работе через Telegram SAFR может получать ваш Telegram ID, имя,
          username и сведения о выбранных услугах. Эти данные нужны для кабинета,
          заявок, поддержки и реферальной системы.
        </p>
        <h2>Как мы используем данные</h2>
        <p>
          Мы используем данные только для оказания выбранных услуг, связи с вами,
          отображения заявок и SAFR Points, а также выполнения обязательств перед
          участниками реферальной программы.
        </p>
        <h2>Передача данных</h2>
        <p>
          Доступ получают только сотрудники и исполнители, которым он необходим
          для выполнения конкретной задачи. Мы не продаём персональные данные.
        </p>
        <h2>Связь с нами</h2>
        <p>
          По вопросам о данных напишите через{" "}
          <a href="https://t.me/safr_bali_bot">Telegram-бот SAFR</a>.
        </p>
      </article>
    </main>
  );
}
