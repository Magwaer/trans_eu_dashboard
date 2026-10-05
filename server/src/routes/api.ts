import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { rematchAll } from "../services/match.js";
import { executeAction } from "../services/automation.js";
import { pullHistoric, recentSyncs, syncLive } from "../services/sync.js";
import { analyzeDesk, draftReply, suggestPrice } from "../services/anthropic.js";
import { transEu } from "../services/transEuClient.js";
import { getValidAccessToken } from "../services/transEuAuth.js";
import { searchExchange } from "../services/exchangeSearch.js";

export const apiRouter = Router();

const nullableNum = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}, z.number().nullable().optional());

const optionalNum = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}, z.number().optional());

const feedSchema = z.object({
  name: z.string().min(2),
  enabled: z.boolean().optional(),
  loading_countries: z.array(z.string()).optional(),
  loading_localities: z.array(z.string()).optional(),
  unloading_countries: z.array(z.string()).optional(),
  unloading_localities: z.array(z.string()).optional(),
  truck_bodies: z.array(z.string()).optional(),
  vehicle_sizes: z.array(z.string()).optional(),
  transport_types: z.array(z.string()).optional(),
  min_weight_t: nullableNum,
  max_weight_t: nullableNum,
  min_distance_km: nullableNum,
  max_distance_km: nullableNum,
  date_window_days: optionalNum,
  currency: z.string().optional(),
  target_rate_per_km: nullableNum,
  min_price: nullableNum,
  max_price: nullableNum,
  min_margin_pct: nullableNum,
  auto_accept_threshold: nullableNum,
  first_offer_discount_pct: optionalNum,
  max_rounds: optionalNum,
  strategy: z.enum(["aggressive", "moderate", "conservative"]).optional(),
  auto_mode: z.enum(["off", "suggest", "execute"]).optional(),
  notes: z.string().nullable().optional(),
});

function feedParseError(error: z.ZodError) {
  const flat = error.flatten();
  const fields = Object.entries(flat.fieldErrors)
    .map(([key, messages]) => `${key}: ${(messages || []).join(", ")}`)
    .join("; ");
  return { error: fields || flat.formErrors.join("; ") || "Invalid feed", ...flat };
}

apiRouter.get("/dashboard", async (_req, res) => {
  const [feeds, freights, negotiations, orders, actions, samples, syncs] = await Promise.all([
    query("SELECT count(*)::int AS n FROM feeds WHERE enabled = true"),
    query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE source = 'proposal')::int AS proposals,
              count(*) FILTER (WHERE source = 'own')::int AS own,
              count(*) FILTER (WHERE matched_feed_id IS NOT NULL AND source <> 'historic')::int AS matched
       FROM freights`
    ),
    query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE status = 'negotiation')::int AS open
       FROM negotiations`
    ),
    query("SELECT count(*)::int AS n FROM orders"),
    query(
      `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
              count(*) FILTER (WHERE status = 'executed')::int AS executed
       FROM automation_actions`
    ),
    query("SELECT count(*)::int AS n FROM training_samples"),
    recentSyncs(),
  ]);
  const lanes = await query(
    `SELECT loading_country, unloading_country, count(*)::int AS n,
            avg(published_price)::numeric(10,1) AS avg_price
     FROM freights WHERE source <> 'historic'
     GROUP BY 1,2 ORDER BY n DESC`
  );
  res.json({
    feeds: feeds.rows[0].n,
    freights: freights.rows[0],
    negotiations: negotiations.rows[0],
    orders: orders.rows[0].n,
    actions: actions.rows[0],
    training: samples.rows[0].n,
    lanes: lanes.rows,
    syncs,
  });
});

apiRouter.get("/feeds", async (_req, res) => {
  const rows = await query(
    `SELECT f.*,
      (SELECT count(*)::int FROM freights fr WHERE fr.matched_feed_id = f.id AND fr.source <> 'historic') AS watched
     FROM feeds f ORDER BY created_at`
  );
  res.json(rows.rows);
});

apiRouter.post("/feeds", async (req, res) => {
  const parsed = feedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(feedParseError(parsed.error));
    return;
  }
  const f = parsed.data;
  const inserted = await query(
    `INSERT INTO feeds (
      name, enabled, loading_countries, loading_localities, unloading_countries,
      unloading_localities, truck_bodies, vehicle_sizes, transport_types,
      min_weight_t, max_weight_t, min_distance_km, max_distance_km, date_window_days,
      currency, target_rate_per_km, min_price, max_price, min_margin_pct,
      auto_accept_threshold, first_offer_discount_pct, max_rounds, strategy, auto_mode, notes
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
    ) RETURNING *`,
    [
      f.name, f.enabled ?? true, f.loading_countries || [], f.loading_localities || [],
      f.unloading_countries || [], f.unloading_localities || [], f.truck_bodies || [],
      f.vehicle_sizes || [], f.transport_types || [], f.min_weight_t ?? null, f.max_weight_t ?? null,
      f.min_distance_km ?? null, f.max_distance_km ?? null, f.date_window_days ?? 14,
      f.currency || "EUR", f.target_rate_per_km ?? null, f.min_price ?? null, f.max_price ?? null,
      f.min_margin_pct ?? null, f.auto_accept_threshold ?? null, f.first_offer_discount_pct ?? 8,
      f.max_rounds ?? 3, f.strategy || "moderate", f.auto_mode || "suggest", f.notes ?? null,
    ]
  );
  await rematchAll();
  res.status(201).json(inserted.rows[0]);
});

apiRouter.patch("/feeds/:id", async (req, res) => {
  const parsed = feedSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(feedParseError(parsed.error));
    return;
  }
  const current = (await query("SELECT * FROM feeds WHERE id = $1", [req.params.id])).rows[0];
  if (!current) {
    res.status(404).json({ error: "Feed not found" });
    return;
  }
  const f = { ...current, ...parsed.data };
  const updated = await query(
    `UPDATE feeds SET
      name=$2, enabled=$3, loading_countries=$4, loading_localities=$5, unloading_countries=$6,
      unloading_localities=$7, truck_bodies=$8, vehicle_sizes=$9, transport_types=$10,
      min_weight_t=$11, max_weight_t=$12, min_distance_km=$13, max_distance_km=$14,
      date_window_days=$15, currency=$16, target_rate_per_km=$17, min_price=$18, max_price=$19,
      min_margin_pct=$20, auto_accept_threshold=$21, first_offer_discount_pct=$22,
      max_rounds=$23, strategy=$24, auto_mode=$25, notes=$26, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [
      req.params.id, f.name, f.enabled, f.loading_countries, f.loading_localities,
      f.unloading_countries, f.unloading_localities, f.truck_bodies, f.vehicle_sizes,
      f.transport_types, f.min_weight_t, f.max_weight_t, f.min_distance_km, f.max_distance_km,
      f.date_window_days, f.currency, f.target_rate_per_km, f.min_price, f.max_price,
      f.min_margin_pct, f.auto_accept_threshold, f.first_offer_discount_pct, f.max_rounds,
      f.strategy, f.auto_mode, f.notes,
    ]
  );
  await rematchAll();
  res.json(updated.rows[0]);
});

apiRouter.delete("/feeds/:id", async (req, res) => {
  await query("DELETE FROM feeds WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

const exchangeSchema = z.object({
  loading_country: z.string().optional(),
  loading_locality: z.string().optional(),
  loading_postal: z.string().optional(),
  loading_range_km: nullableNum,
  loading_lat: nullableNum,
  loading_lng: nullableNum,
  unloading_country: z.string().optional(),
  unloading_locality: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  truck_bodies: z.array(z.string()).optional(),
  vehicle_sizes: z.array(z.string()).optional(),
  max_weight_t: nullableNum,
  max_length_m: nullableNum,
  exclude_suspended: z.boolean().optional(),
  sort_field: z.string().optional(),
  sort_order: z.enum(["asc", "desc"]).optional(),
  limit: optionalNum,
});

apiRouter.post("/exchange", async (req, res) => {
  const parsed = exchangeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid exchange search", ...parsed.error.flatten() });
    return;
  }
  try {
    res.json(await searchExchange(parsed.data));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

apiRouter.get("/inbox", async (req, res) => {
  const source = String(req.query.source || "");
  const feed = String(req.query.feed || "");
  const rows = await query(
    `SELECT fr.*, fe.name AS feed_name, fe.auto_mode, fe.strategy
     FROM freights fr
     LEFT JOIN feeds fe ON fe.id = fr.matched_feed_id
     WHERE fr.source <> 'historic'
       AND ($1 = '' OR fr.source = $1)
       AND ($2 = '' OR fr.matched_feed_id::text = $2)
     ORDER BY fr.loading_at NULLS LAST, fr.updated_at DESC`,
    [source, feed]
  );
  res.json(rows.rows);
});

apiRouter.get("/inbox/:id", async (req, res) => {
  const freight = (await query(
    `SELECT fr.*, fe.name AS feed_name, fe.auto_mode, fe.strategy, fe.target_rate_per_km, fe.min_price
     FROM freights fr LEFT JOIN feeds fe ON fe.id = fr.matched_feed_id
     WHERE fr.id = $1`,
    [req.params.id]
  )).rows[0];
  if (!freight) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [notes, actions, negotiations] = await Promise.all([
    query("SELECT * FROM notes WHERE entity_id = $1 ORDER BY created_at DESC", [req.params.id]),
    query("SELECT * FROM automation_actions WHERE freight_id = $1 ORDER BY created_at DESC", [req.params.id]),
    query("SELECT * FROM negotiations WHERE freight_id = $1", [req.params.id]),
  ]);
  res.json({ freight, notes: notes.rows, actions: actions.rows, negotiations: negotiations.rows });
});

apiRouter.post("/inbox/:id/notes", async (req, res) => {
  const inserted = await query(
    `INSERT INTO notes (entity_type, entity_id, kind, content, value, currency, author)
     VALUES ('freight', $1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      req.params.id,
      req.body.kind || "note",
      req.body.content || null,
      req.body.value ?? null,
      req.body.currency || "EUR",
      req.body.author || "ops",
    ]
  );
  res.status(201).json(inserted.rows[0]);
});

apiRouter.get("/negotiations", async (_req, res) => {
  const rows = await query(
    `SELECT n.*, fr.loading_locality, fr.unloading_locality, fr.loading_country, fr.unloading_country,
            fr.published_price, fr.suggested_price, fr.reference_number, fe.name AS feed_name
     FROM negotiations n
     LEFT JOIN freights fr ON fr.id = n.freight_id
     LEFT JOIN feeds fe ON fe.id = fr.matched_feed_id
     ORDER BY n.updated_at DESC`
  );
  res.json(rows.rows);
});

apiRouter.get("/negotiations/:id", async (req, res) => {
  const negotiation = (await query("SELECT * FROM negotiations WHERE id = $1", [req.params.id])).rows[0];
  if (!negotiation) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const events = await query(
    "SELECT * FROM negotiation_events WHERE negotiation_id = $1 ORDER BY created_at",
    [req.params.id]
  );
  res.json({ negotiation, events: events.rows });
});

async function applyNegotiation(id: string, action: string, body: Record<string, unknown>) {
  const negotiation = (await query("SELECT * FROM negotiations WHERE id = $1", [id])).rows[0];
  if (!negotiation) throw new Error("Negotiation not found");
  const connected = Boolean(await getValidAccessToken().catch(() => null));
  let remote: unknown = { simulated: true };
  if (connected && negotiation.trans_offer_id && !String(negotiation.trans_offer_id).startsWith("neg-") && !String(negotiation.trans_offer_id).startsWith("local-")) {
    const payload = {
      payment: body.price
        ? {
            price: {
              currency: String(body.currency || negotiation.currency || "eur").toLowerCase(),
              type: "route",
              value: Number(body.price),
            },
          }
        : undefined,
      version: Number(body.version || negotiation.version || 1),
    };
    if (action === "counter") remote = await transEu.negotiate(negotiation.trans_offer_id, payload);
    if (action === "accept") remote = await transEu.accept(negotiation.trans_offer_id, { version: payload.version });
    if (action === "reject") remote = await transEu.renounce(negotiation.trans_offer_id, { version: payload.version });
    if (action === "withdraw") remote = await transEu.withdraw(negotiation.trans_offer_id, { version: payload.version });
  }
  await query(
    `UPDATE negotiations SET current_price = COALESCE($2, current_price), currency = COALESCE($3, currency),
      last_action_by = 'ops', rounds = rounds + 1, status = $4, updated_at = now()
     WHERE id = $1`,
    [
      id,
      body.price ?? null,
      body.currency || negotiation.currency,
      action === "accept" ? "acceptation" : action === "reject" ? "renouncement" : "negotiation",
    ]
  );
  await query(
    `INSERT INTO negotiation_events (negotiation_id, freight_id, action, price, currency, actor, source, note, payload)
     VALUES ($1,$2,$3,$4,$5,'ops','manual',$6,$7)`,
    [id, negotiation.freight_id, action, body.price ?? null, body.currency || negotiation.currency, body.note || null, remote]
  );
  return { negotiation: (await query("SELECT * FROM negotiations WHERE id = $1", [id])).rows[0], remote };
}

apiRouter.post("/negotiations/:id/counter", async (req, res) => {
  try {
    res.json(await applyNegotiation(req.params.id, "counter", req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
apiRouter.post("/negotiations/:id/accept", async (req, res) => {
  try {
    res.json(await applyNegotiation(req.params.id, "accept", req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
apiRouter.post("/negotiations/:id/reject", async (req, res) => {
  try {
    res.json(await applyNegotiation(req.params.id, "reject", req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
apiRouter.post("/negotiations/:id/withdraw", async (req, res) => {
  try {
    res.json(await applyNegotiation(req.params.id, "withdraw", req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

apiRouter.get("/orders", async (_req, res) => {
  const rows = await query("SELECT * FROM orders ORDER BY created_at DESC");
  res.json(rows.rows);
});

apiRouter.get("/actions", async (_req, res) => {
  const rows = await query(
    `SELECT a.*, fe.name AS feed_name, fr.loading_locality, fr.unloading_locality, fr.published_price
     FROM automation_actions a
     LEFT JOIN feeds fe ON fe.id = a.feed_id
     LEFT JOIN freights fr ON fr.id = a.freight_id
     ORDER BY a.created_at DESC LIMIT 80`
  );
  res.json(rows.rows);
});

apiRouter.post("/actions/:id/approve", async (req, res) => {
  try {
    res.json(await executeAction(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

apiRouter.post("/actions/:id/cancel", async (req, res) => {
  const row = await query(
    `UPDATE automation_actions SET status = 'cancelled' WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  res.json(row.rows[0]);
});

apiRouter.post("/sync", async (_req, res) => {
  res.json(await syncLive());
});

apiRouter.get("/historic", async (_req, res) => {
  const [samples, freights] = await Promise.all([
    query("SELECT * FROM training_samples ORDER BY created_at DESC LIMIT 200"),
    query("SELECT * FROM freights WHERE source = 'historic' ORDER BY loading_at DESC NULLS LAST"),
  ]);
  res.json({ samples: samples.rows, freights: freights.rows });
});

apiRouter.post("/historic/pull", async (_req, res) => {
  res.json(await pullHistoric());
});

apiRouter.get("/historic/export", async (_req, res) => {
  const rows = await query("SELECT source, trans_id, route_key, features, outcome, created_at FROM training_samples");
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Content-Disposition", "attachment; filename=trans-eu-training.jsonl");
  res.send(rows.rows.map((row) => JSON.stringify(row)).join("\n"));
});

apiRouter.post("/ai/price", async (req, res) => {
  try {
    res.json(await suggestPrice(req.body.freightId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

apiRouter.post("/ai/reply", async (req, res) => {
  try {
    res.json(await draftReply(req.body));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

apiRouter.post("/ai/analyze", async (req, res) => {
  try {
    res.json(await analyzeDesk(req.body.question || "Summarize the desk and flag risks."));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

apiRouter.get("/settings", async (_req, res) => {
  const rows = await query("SELECT * FROM settings");
  res.json(Object.fromEntries(rows.rows.map((r) => [r.key, r.value])));
});

apiRouter.patch("/settings/:key", async (req, res) => {
  const row = await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
     RETURNING *`,
    [req.params.key, req.body]
  );
  res.json(row.rows[0]);
});
