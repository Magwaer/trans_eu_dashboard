export type Strategy = "aggressive" | "moderate" | "conservative";

export type PricingInput = {
  publishedPrice?: number | null;
  distanceKm?: number | null;
  targetRatePerKm?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  firstOfferDiscountPct?: number | null;
  autoAcceptThreshold?: number | null;
  strategy?: Strategy | null;
  role?: "participant" | "owner";
};

export type PricingPlan = {
  target: number | null;
  firstOffer: number | null;
  floor: number | null;
  ceiling: number | null;
  autoAcceptAt: number | null;
  ratePerKm: number | null;
  rationale: string[];
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function computePricing(input: PricingInput): PricingPlan {
  const rationale: string[] = [];
  const distanceKm = input.distanceKm && input.distanceKm > 0 ? input.distanceKm : null;
  const published = input.publishedPrice && input.publishedPrice > 0 ? input.publishedPrice : null;
  const rateTarget =
    distanceKm && input.targetRatePerKm ? roundMoney(distanceKm * input.targetRatePerKm) : null;

  let target = published ?? rateTarget;
  if (published && rateTarget) {
    target = input.role === "owner" ? Math.min(published, rateTarget) : Math.max(published * 0.92, rateTarget);
    rationale.push(
      `Blend published ${published} with rate target ${rateTarget} (${input.targetRatePerKm}/km × ${distanceKm} km).`
    );
  } else if (rateTarget) {
    rationale.push(`Rate target ${input.targetRatePerKm}/km × ${distanceKm} km = ${rateTarget}.`);
  } else if (published) {
    rationale.push(`Using published price ${published} as the market anchor.`);
  }

  if (input.minPrice && target) target = Math.max(target, Number(input.minPrice));
  if (input.maxPrice && target) target = Math.min(target, Number(input.maxPrice));

  const strategy = input.strategy || "moderate";
  const discount =
    strategy === "aggressive" ? (input.firstOfferDiscountPct ?? 12) + 4
    : strategy === "conservative" ? Math.max(2, (input.firstOfferDiscountPct ?? 8) - 4)
    : input.firstOfferDiscountPct ?? 8;

  let firstOffer = target;
  if (target && input.role !== "owner") {
    firstOffer = roundMoney(target * (1 - discount / 100));
    rationale.push(`${strategy} first offer is ${discount}% below target.`);
  } else if (target && input.role === "owner") {
    firstOffer = roundMoney(target * (1 + Math.min(8, discount) / 200));
    rationale.push("Shipper-side counter stays close to target to keep conversion.");
  }

  const floor = input.minPrice ? Number(input.minPrice) : firstOffer && input.role === "participant"
    ? roundMoney(firstOffer * 0.96)
    : null;
  const ceiling = input.maxPrice ? Number(input.maxPrice) : target && input.role === "owner"
    ? roundMoney(target * 1.08)
    : null;

  const autoAcceptAt = input.autoAcceptThreshold
    ? Number(input.autoAcceptThreshold)
    : target
      ? input.role === "participant"
        ? roundMoney(target * 0.97)
        : roundMoney(target * 1.02)
      : null;

  const ratePerKm = target && distanceKm ? roundMoney(target / distanceKm) : null;

  return {
    target: target ? roundMoney(target) : null,
    firstOffer: firstOffer ? roundMoney(firstOffer) : null,
    floor,
    ceiling,
    autoAcceptAt,
    ratePerKm,
    rationale,
  };
}

export function nextCounter(params: {
  current: number;
  target: number;
  floor?: number | null;
  ceiling?: number | null;
  role: "participant" | "owner";
  rounds: number;
  maxRounds: number;
}) {
  const { current, target, role, rounds, maxRounds } = params;
  if (rounds >= maxRounds) return target;
  const gap = target - current;
  const step = gap * (role === "participant" ? 0.45 : 0.4);
  let next = current + step;
  if (params.floor != null) next = Math.max(next, params.floor);
  if (params.ceiling != null) next = Math.min(next, params.ceiling);
  return roundMoney(next);
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return roundMoney(2 * R * Math.asin(Math.sqrt(s)));
}
