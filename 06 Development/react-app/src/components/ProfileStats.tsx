import type { Dashboard } from "../api/types";
import { useI18n } from "../i18n/runtime";
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';

type ProfileStatsProps = {
  dashboard: Dashboard | null;
  pending?: boolean;
  ui?:ClientUiBindings;
};

export function ProfileStats({ dashboard, pending = false,ui }: ProfileStatsProps) {
  const { locale, t:legacyText } = useI18n();
  const binding=YOGA_MINI_APP||ui===undefined?undefined:requireClientUiBindings(ui),t=binding?.text??legacyText;
  return (
    <section className="profile-stats" aria-label={t("profile.statsAria")} lang={binding?.locale} dir={binding?.dir}>
      <article>
        <span>{t("profile.stats.points")}</span>
        <strong>{pending ? "—" : dashboard?.balance.toLocaleString(binding?.locale??(locale === "en" ? "en-US" : "ru-RU")) ?? 0}</strong>
      </article>
      <article>
        <span>{t("profile.stats.network")}</span>
        <strong>{pending ? "—" : dashboard?.referral_count ?? 0}</strong>
      </article>
      <article>
        <span>{t("profile.stats.orders")}</span>
        <strong>{pending ? "—" : dashboard?.orders.length ?? 0}</strong>
      </article>
    </section>
  );
}
