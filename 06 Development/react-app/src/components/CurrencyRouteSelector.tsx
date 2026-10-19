import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import type { ExchangeCurrencyOption } from "../api/types";
import { ExchangeAssetWheel } from "./ExchangeAssetWheel";
import { useI18n } from "../i18n/runtime";
import { requireClientUiBindings, type ClientUiBindings } from "../i18n/client-ui-bindings";

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
  ui?: ClientUiBindings;
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
  ui,
}: CurrencyRouteSelectorProps) {
  const legacy = useI18n();
  const client = YOGA_MINI_APP || ui === undefined ? undefined : requireClientUiBindings(ui);
  const t = client?.text ?? legacy.t;
  return (
    <section className="calculator-card currency-route-selector" aria-label={t("calculator.routeAria")}>
      <ExchangeAssetWheel
        ui={client}
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
        ui={client}
        label={t("calculator.receive")}
        value={receiveCurrency}
        options={receiveOptions}
        onChange={onReceiveChange}
        onHaptic={onHaptic}
      />
    </section>
  );
}
