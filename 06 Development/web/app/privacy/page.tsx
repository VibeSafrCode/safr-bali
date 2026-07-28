import type { Metadata } from "next";
import { ManagerButton } from "../../components/ManagerButton";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <SiteHeader />
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
          По вопросам о данных{" "}
          <ManagerButton>напишите менеджеру</ManagerButton>.
        </p>
      </article>
    </main>
  );
}
