import type { PricingProjection } from '../pricing/runtime';
import { formatLifePrice, lifeCopy, type LifeLocale, type LifeService } from './lifeServices';
export type LifePricingProjection = { fx?: Pick<PricingProjection['fx'], 'status' | 'ask_idr_per_usdt'>; derived_expires_at?: string };
function decimal(value: string | null | undefined) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [a,b=''] = value.split('.');
  return { n: BigInt(a+b), scale: 10n ** BigInt(b.length) };
}
export function compactLifePrice(item: Pick<LifeService,'price_amount'|'price_currency'|'price_unit'>, locale: LifeLocale) {
  const value=decimal(item.price_amount);
  if (!value) return null;
  if (item.price_currency !== 'IDR' || value.n < 1000n * value.scale) return formatLifePrice(item,locale);
  const [whole,fraction='']=item.price_amount!.split('.');
  const padded=whole.padStart(4,'0');
  const thousands=BigInt(padded.slice(0,-3)).toString();
  const tail=(padded.slice(-3)+fraction).replace(/0+$/,'');
  return `${thousands}${tail ? (locale==='ru' ? ',' : '.')+tail : ''}K IDR ${lifeCopy[locale][item.price_unit]}`;
}
// Approximate display only: same accepted catalog ask, nearest 5 USDT, half up.
export function approximateLifeUsdt(amount: string | null, projection: LifePricingProjection | null | undefined, now: number) {
  const fx=projection?.fx;
  if (!fx || !['fresh','stale'].includes(fx.status ?? '')) return null;
  const expires=Date.parse(projection?.derived_expires_at ?? '');
  if (!Number.isFinite(expires) || expires<=now) return null;
  const a=decimal(amount),r=decimal(fx.ask_idr_per_usdt);
  if (!a || !r || r.n===0n) return null;
  const numerator=a.n*r.scale, denominator=a.scale*r.n*5n;
  const steps=(2n*numerator+denominator)/(2n*denominator);
  return (steps*5n).toString();
}
