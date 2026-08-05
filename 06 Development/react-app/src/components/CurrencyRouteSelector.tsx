import type { ExchangeCurrencyOption } from "../api/types";
import { ExchangeAssetWheel } from "./ExchangeAssetWheel";

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
  return (
    <section className="calculator-card currency-route-selector" aria-label="Маршрут обмена">
      <ExchangeAssetWheel
        label="Отдаёте"
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
            ? "Поменять направление обмена"
            : "Обратное направление недоступно"
        }
        disabled={!canSwap}
        onClick={onSwap}
      >
        <span aria-hidden="true">⇄</span>
      </button>
      <ExchangeAssetWheel
        label="Получаете"
        value={receiveCurrency}
        options={receiveOptions}
        onChange={onReceiveChange}
        onHaptic={onHaptic}
      />
    </section>
  );
}
