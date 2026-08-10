import type { Dashboard } from "../api/types";
import { useI18n } from "../i18n/runtime";

type ProfileStatsProps = {
  dashboard: Dashboard | null;
};

export function ProfileStats({ dashboard }: ProfileStatsProps) {
  const { locale, t } = useI18n();
  return (
    <section className="profile-stats" aria-label={t("profile.statsAria")}>
      <article>
        <span>{t("profile.stats.points")}</span>
        <strong>{dashboard?.balance.toLocaleString(locale === "en" ? "en-US" : "ru-RU") ?? 0}</strong>
      </article>
      <article>
        <span>{t("profile.stats.network")}</span>
        <strong>{dashboard?.referral_count ?? 0}</strong>
      </article>
      <article>
        <span>{t("profile.stats.orders")}</span>
        <strong>{dashboard?.orders.length ?? 0}</strong>
      </article>
    </section>
  );
}
