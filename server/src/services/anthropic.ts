import Anthropic from "@anthropic-ai/sdk";
import { config, anthropicConfigured } from "../config.js";
import { query } from "../db/pool.js";
import { computePricing } from "../lib/pricing.js";

function client() {
  if (!anthropicConfigured()) return null;
  return new Anthropic({ apiKey: config.anthropic.apiKey });
}

async function complete(kind: string, prompt: string, entity?: { type: string; id: string }) {
  const c = client();
  if (!c) {
    return {
      text: fallback(kind, prompt),
      model: "heuristic",
      usage: null as null,
    };
  }
  const res = await c.messages.create({
    model: config.anthropic.model,
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();
  await query(
    `INSERT INTO ai_runs (kind, model, prompt, response, entity_type, entity_id, usage)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      kind,
      res.model,
      prompt,
      text,
      entity?.type || null,
      entity?.id || null,
      res.usage,
    ]
  );
  return { text, model: res.model, usage: res.usage };
}

function fallback(kind: string, prompt: string) {
  if (kind === "price") {
    return JSON.stringify({
      recommended_price: null,
      action: "review",
      message: "Anthropic is not configured. Using local pricing rules only.",
    });
  }
  if (kind === "reply") {
    return "Thank you for the offer. After checking empty-km and loading window we can work this lane — please see our counter. If the window slips we will need to revisit the rate.";
  }
  return `Heuristic response (${kind}). Configure ANTHROPIC_API_KEY for model output.\n\nContext:\n${prompt.slice(0, 400)}`;
}

export async function suggestPrice(freightId: string) {
  const freight = await query("SELECT * FROM freights WHERE id = $1", [freightId]);
  const row = freight.rows[0];
  if (!row) throw new Error("Freight not found");
  const feed = row.matched_feed_id
    ? (await query("SELECT * FROM feeds WHERE id = $1", [row.matched_feed_id])).rows[0]
    : null;
  const history = await query(
    `SELECT features, outcome FROM training_samples
     WHERE route_key = $1
     ORDER BY created_at DESC LIMIT 12`,
    [
      `${(row.loading_country || "?").toLowerCase()}>${(row.loading_locality || "?").toLowerCase()}>${(row.unloading_country || "?").toLowerCase()}>${(row.unloading_locality || "?").toLowerCase()}`,
    ]
  );
  const plan = computePricing({
    publishedPrice: row.published_price ? Number(row.published_price) : null,
    distanceKm: row.distance_m ? Number(row.distance_m) / 1000 : null,
    targetRatePerKm: feed?.target_rate_per_km ? Number(feed.target_rate_per_km) : null,
    minPrice: feed?.min_price ? Number(feed.min_price) : null,
    maxPrice: feed?.max_price ? Number(feed.max_price) : null,
    firstOfferDiscountPct: feed ? Number(feed.first_offer_discount_pct) : 8,
    autoAcceptThreshold: feed?.auto_accept_threshold ? Number(feed.auto_accept_threshold) : null,
    strategy: feed?.strategy || "moderate",
  });

  const prompt = `You are a European road-freight desk. Return compact JSON only:
{"recommended_price": number|null, "currency": "EUR", "action": "counter"|"accept"|"pass"|"review", "confidence": 0-1, "message": "short operator note", "rationale": ["..."]}

Freight:
${JSON.stringify({
  route: `${row.loading_locality} ${row.loading_country} -> ${row.unloading_locality} ${row.unloading_country}`,
  distance_km: row.distance_m ? Number(row.distance_m) / 1000 : null,
  weight_t: row.weight_t,
  truck_bodies: row.truck_bodies,
  published_price: row.published_price,
  currency: row.published_currency,
  loading_at: row.loading_at,
  is_first_buy: row.is_first_buy,
})}

Feed rules:
${JSON.stringify(feed || {})}

Local pricing plan:
${JSON.stringify(plan)}

Historic closed deals on this route:
${JSON.stringify(history.rows)}`;

  const result = await complete("price", prompt, { type: "freight", id: freightId });
  let parsed: Record<string, unknown> = {};
  try {
    const match = result.text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  } catch {
    parsed = {};
  }
  const recommended =
    typeof parsed.recommended_price === "number" ? parsed.recommended_price : plan.firstOffer;
  if (recommended) {
    await query(
      `UPDATE freights SET suggested_price = $2, suggested_currency = $3, ai_summary = $4, updated_at = now() WHERE id = $1`,
      [freightId, recommended, (parsed.currency as string) || row.published_currency || "EUR", parsed.message || result.text.slice(0, 400)]
    );
  }
  return { ...result, plan, parsed, recommended };
}

export async function draftReply(params: {
  freightId?: string;
  negotiationId?: string;
  intent: string;
  extra?: string;
}) {
  const freight = params.freightId
    ? (await query("SELECT * FROM freights WHERE id = $1", [params.freightId])).rows[0]
    : null;
  const negotiation = params.negotiationId
    ? (await query("SELECT * FROM negotiations WHERE id = $1", [params.negotiationId])).rows[0]
    : null;
  const notes = params.freightId
    ? (await query(
        `SELECT kind, content, value, created_at FROM notes WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 8`,
        [params.freightId]
      )).rows
    : [];

  const prompt = `Write a short, professional Trans.eu negotiation message in English (and a Polish version after ---).
No fluff, no promises you cannot keep. Intent: ${params.intent}
Operator note: ${params.extra || "none"}
Freight: ${JSON.stringify(freight)}
Negotiation: ${JSON.stringify(negotiation)}
Manual inputs: ${JSON.stringify(notes)}`;

  return complete("reply", prompt, {
    type: negotiation ? "negotiation" : "freight",
    id: params.negotiationId || params.freightId || "",
  });
}

export async function analyzeDesk(question: string) {
  const [feeds, open, actions, samples] = await Promise.all([
    query("SELECT name, enabled, auto_mode, strategy FROM feeds"),
    query(
      `SELECT loading_locality, unloading_locality, published_price, suggested_price, status
       FROM freights WHERE source <> 'historic' ORDER BY updated_at DESC LIMIT 20`
    ),
    query(
      `SELECT action, status, reason FROM automation_actions ORDER BY created_at DESC LIMIT 15`
    ),
    query(
      `SELECT route_key, features, outcome FROM training_samples ORDER BY created_at DESC LIMIT 20`
    ),
  ]);
  const prompt = `You are the ops analyst for a Trans.eu freight desk. Answer clearly with concrete numbers.
Question: ${question}

Feeds: ${JSON.stringify(feeds.rows)}
Open freights: ${JSON.stringify(open.rows)}
Recent automation: ${JSON.stringify(actions.rows)}
Historic samples: ${JSON.stringify(samples.rows)}`;
  return complete("analyze", prompt);
}
