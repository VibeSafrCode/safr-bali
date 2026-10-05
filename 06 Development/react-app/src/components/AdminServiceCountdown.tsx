import React, { useEffect, useState } from "react";
import { baliToday, lifeCountdown, type LifeLocale } from "./lifeServices";
import { lifeProgress } from "./lifeProgress";

export function useBaliToday() {
  const [today, setToday] = useState(baliToday);
  useEffect(() => {
    const update = () => setToday(baliToday());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  return today;
}

// Uses the customer cabinet's calendar and monthly-cycle rules, never a guessed term.
export function AdminServiceCountdown({ start = null, end, today, locale, monthly = false, terminal = false, estimated = false }: {
  start?: string | null; end: string | null; today: string; locale: LifeLocale;
  monthly?: boolean; terminal?: boolean; estimated?: boolean;
}) {
  if (terminal) return null;
  const future = !!start && start > today;
  const progress = future ? null : lifeProgress(start, end, today, monthly);
  const date = progress?.repeating ? progress.end : future ? start : end;
  const count = lifeCountdown(date, today, locale);
  if (!count) return null;
  const monthlyCycle = !!progress?.repeating && progress.end !== end;
  const tone = future || monthlyCycle ? "neutral" : count.expired ? "expired" : count.urgency ?? "neutral";
  const label = future ? (locale === "ru" ? "До начала" : "Starts in") : monthlyCycle ? (locale === "ru" ? "До конца периода" : "Cycle remaining") : count.label;
  const cycleHint = progress?.repeating ? (locale === "ru" ? `Прошло ${progress.elapsed} из ${progress.total} дней периода` : `${progress.elapsed} of ${progress.total} cycle days elapsed`) : undefined;
  return <span title={cycleHint} className={`admin-service-countdown is-${tone}${estimated ? " is-estimated" : ""}`} aria-label={`${estimated ? (locale === "ru" ? "Предварительно. " : "Estimated. ") : ""}${label}: ${count.value} ${count.unit}${cycleHint ? `. ${cycleHint}` : ""}`}>
    {progress && <svg viewBox="0 0 88 88" aria-hidden="true"><circle className="admin-countdown-track" cx="44" cy="44" r="40"/><circle className="admin-countdown-arc" cx="44" cy="44" r="40" pathLength="100" opacity={progress.fraction === 0 ? 0 : 1} strokeDasharray={`${progress.fraction * 100} 100`} transform="rotate(-90 44 44)"/>{progress.repeating && <circle className="admin-countdown-marker" cx={44 + 40 * Math.sin(progress.fraction * 2 * Math.PI)} cy={44 - 40 * Math.cos(progress.fraction * 2 * Math.PI)} r="3"/>}</svg>}
    <span className="admin-countdown-value" aria-hidden="true"><small>{label}</small><strong className={count.value >= 1000 ? "is-long" : undefined}>{count.value}</strong><small>{count.unit}</small></span>
  </span>;
}
