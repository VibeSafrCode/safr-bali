import type { ExchangeCurrencyOption } from "../api/types";
import { ExchangeAssetWheel } from "./ExchangeAssetWheel";
import { useI18n } from "../i18n/runtime";

type CurrencyRouteSelectorProps = {
  giveCurrency: string;
  giveOptions: ExchangeCurrencyOption[];
  receiveCurrency: string;
  receiveOptions: ExchangeCurrencyOption[];
  canSwap: boolean;
  onGiveChange: (value: string) => void;
  onReceiveChange: (value: string) => void;
  onSwap: () => void;
  onHaptic?: () => void;
};

export function CurrencyRouteSelector({
  giveCurrency,
  giveOptions,
  receiveCurrency,
  receiveOptions,
  canSwap,
  onGiveChange,
  onReceiveChange,
  onSwap,
  onHaptic,
}: CurrencyRouteSelectorProps) {
  const { t } = useI18n();
  return (
    <section className="calculator-card currency-route-selector" aria-label={t("calculator.routeAria")}>
      <ExchangeAssetWheel
        label={t("calculator.give")}
        value={giveCurrency}
        options={giveOptions}
        onChange={onGiveChange}
        onHaptic={onHaptic}
      />
      <button
        className="currency-swap"
        type="button"
        aria-label={
          canSwap
            ? t("calculator.swapAria")
            : t("calculator.reverseUnavailableAria")
        }
        disabled={!canSwap}
        onClick={onSwap}
      >
        <span aria-hidden="true">⇄</span>
      </button>
      <ExchangeAssetWheel
        label={t("calculator.receive")}
        value={receiveCurrency}
        options={receiveOptions}
        onChange={onReceiveChange}
        onHaptic={onHaptic}
      />
    </section>
  );
}
