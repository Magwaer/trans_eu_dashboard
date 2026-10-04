import { query } from "../db/pool.js";
import { computePricing, type Strategy } from "../lib/pricing.js";

export type FeedRow = {
  id: string;
  name: string;
  enabled: boolean;
  loading_countries: string[];
  loading_localities: string[];
  unloading_countries: string[];
  unloading_localities: string[];
  truck_bodies: string[];
  vehicle_sizes: string[];
  transport_types: string[];
  min_weight_t: string | null;
  max_weight_t: string | null;
  min_distance_km: string | null;
  max_distance_km: string | null;
  date_window_days: number;
  currency: string;
  target_rate_per_km: string | null;
  min_price: string | null;
  max_price: string | null;
  min_margin_pct: string | null;
  auto_accept_threshold: string | null;
  first_offer_discount_pct: string;
  max_rounds: number;
  strategy: Strategy;
  auto_mode: "off" | "suggest" | "execute";
  notes: string | null;
};

export type FreightRow = {
  id: string;
  loading_country: string | null;
  loading_locality: string | null;
  unloading_country: string | null;
  unloading_locality: string | null;
  truck_bodies: string[];
  vehicle_size: string | null;
  transport_type: string | null;
  weight_t: string | null;
  distance_m: number | null;
  loading_at: Date | null;
  published_price: string | null;
  published_currency: string | null;
};

function includesLoose(list: string[], value?: string | null) {
  if (!list.length) return true;
  if (!value) return false;
  const v = value.toLowerCase();
  return list.some((item) => v.includes(item.toLowerCase()) || item.toLowerCase().includes(v));
}

export function scoreFeed(feed: FeedRow, freight: FreightRow) {
  let score = 0;
  const reasons: string[] = [];

  if (!includesLoose(feed.loading_countries, freight.loading_country)) return { score: 0, reasons: ["loading country"] };
  if (!includesLoose(feed.unloading_countries, freight.unloading_country)) return { score: 0, reasons: ["unloading country"] };
  if (!includesLoose(feed.loading_localities, freight.loading_locality)) return { score: 0, reasons: ["loading locality"] };
  if (!includesLoose(feed.unloading_localities, freight.unloading_locality)) return { score: 0, reasons: ["unloading locality"] };
  if (feed.truck_bodies.length && !freight.truck_bodies.some((b) => includesLoose(feed.truck_bodies, b))) {
    return { score: 0, reasons: ["truck body"] };
  }
  if (!includesLoose(feed.vehicle_sizes, freight.vehicle_size)) return { score: 0, reasons: ["vehicle size"] };
  if (!includesLoose(feed.transport_types, freight.transport_type)) return { score: 0, reasons: ["transport type"] };

  score += 40;
  if (feed.loading_countries.length) { score += 8; reasons.push("origin country"); }
  if (feed.unloading_countries.length) { score += 8; reasons.push("dest country"); }
  if (feed.loading_localities.length) { score += 10; reasons.push("origin city"); }
  if (feed.unloading_localities.length) { score += 10; reasons.push("dest city"); }

  const weight = freight.weight_t ? Number(freight.weight_t) : null;
  if (weight != null) {
    if (feed.min_weight_t && weight < Number(feed.min_weight_t)) return { score: 0, reasons: ["min weight"] };
    if (feed.max_weight_t && weight > Number(feed.max_weight_t)) return { score: 0, reasons: ["max weight"] };
    score += 6;
  }

  const km = freight.distance_m ? freight.distance_m / 1000 : null;
  if (km != null) {
    if (feed.min_distance_km && km < Number(feed.min_distance_km)) return { score: 0, reasons: ["min distance"] };
    if (feed.max_distance_km && km > Number(feed.max_distance_km)) return { score: 0, reasons: ["max distance"] };
    score += 6;
  }

  if (freight.loading_at && feed.date_window_days) {
    const days = (new Date(freight.loading_at).getTime() - Date.now()) / 86400000;
    if (days < -1 || days > feed.date_window_days) return { score: 0, reasons: ["date window"] };
    score += 6;
  }

  return { score: Math.min(100, score), reasons };
}

export async function matchFreightToFeeds(freightId: string) {
  const freightRes = await query<FreightRow>("SELECT * FROM freights WHERE id = $1", [freightId]);
  const freight = freightRes.rows[0];
  if (!freight) return null;
  const feeds = await query<FeedRow>("SELECT * FROM feeds WHERE enabled = true");

  let best: { feed: FeedRow; score: number; reasons: string[] } | null = null;
  for (const feed of feeds.rows) {
    const result = scoreFeed(feed, freight);
    if (result.score > 0 && (!best || result.score > best.score)) {
      best = { feed, score: result.score, reasons: result.reasons };
    }
  }

  if (!best) {
    await query(
      `UPDATE freights SET matched_feed_id = NULL, match_score = 0, suggested_price = NULL, updated_at = now() WHERE id = $1`,
      [freightId]
    );
    return null;
  }

  const plan = computePricing({
    publishedPrice: freight.published_price ? Number(freight.published_price) : null,
    distanceKm: freight.distance_m ? freight.distance_m / 1000 : null,
    targetRatePerKm: best.feed.target_rate_per_km ? Number(best.feed.target_rate_per_km) : null,
    minPrice: best.feed.min_price ? Number(best.feed.min_price) : null,
    maxPrice: best.feed.max_price ? Number(best.feed.max_price) : null,
    firstOfferDiscountPct: Number(best.feed.first_offer_discount_pct),
    autoAcceptThreshold: best.feed.auto_accept_threshold ? Number(best.feed.auto_accept_threshold) : null,
    strategy: best.feed.strategy,
    role: "participant",
  });

  await query(
    `UPDATE freights
     SET matched_feed_id = $2, match_score = $3, suggested_price = $4,
         suggested_currency = $5, updated_at = now()
     WHERE id = $1`,
    [freightId, best.feed.id, best.score, plan.firstOffer, best.feed.currency]
  );

  return { feed: best.feed, score: best.score, reasons: best.reasons, plan };
}

export async function rematchAll() {
  const res = await query<{ id: string }>("SELECT id FROM freights");
  const results = [];
  for (const row of res.rows) {
    results.push(await matchFreightToFeeds(row.id));
  }
  return results.filter(Boolean);
}
