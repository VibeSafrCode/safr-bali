import type { LifeKind } from "./lifeServices";

// Only backend-supported client records, not the public catalogue of products.
export const clientServiceTypes = [
  { kind: "bike", icon: "bike" },
  { kind: "insurance", icon: "shield" },
  { kind: "housing", icon: "⌂" },
  { kind: "other", icon: "✦" },
] as const satisfies ReadonlyArray<{ kind: LifeKind; icon: string }>;

export function clientServiceIcon(kind: LifeKind): string {
  return clientServiceTypes.find((item) => item.kind === kind)?.icon ?? "✦";
}
