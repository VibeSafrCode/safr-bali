import type { Dashboard } from "../api/types";

type ProfileStatsProps = {
  dashboard: Dashboard | null;
};

export function ProfileStats({ dashboard }: ProfileStatsProps) {
  return (
    <section className="profile-stats" aria-label="Статистика профиля">
      <article>
        <span>SAFR Points</span>
        <strong>{dashboard?.balance.toLocaleString("ru-RU") ?? 0}</strong>
      </article>
      <article>
        <span>Моя сеть</span>
        <strong>{dashboard?.referral_count ?? 0}</strong>
      </article>
      <article>
        <span>Заявки</span>
        <strong>{dashboard?.orders.length ?? 0}</strong>
      </article>
    </section>
  );
}
