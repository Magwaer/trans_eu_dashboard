import { config } from "../config.js";
import { query } from "../db/pool.js";
import { nextCounter } from "../lib/pricing.js";
import { matchFreightToFeeds, type FeedRow } from "./match.js";
import { transEu } from "./transEuClient.js";
import { getValidAccessToken } from "./transEuAuth.js";

export async function enqueueForFreight(freightId: string) {
  const match = await matchFreightToFeeds(freightId);
  if (!match || match.feed.auto_mode === "off") return null;

  const existing = await query(
    `SELECT id FROM automation_actions
     WHERE freight_id = $1 AND status IN ('pending','executed') AND action = 'propose_price'
     ORDER BY created_at DESC LIMIT 1`,
    [freightId]
  );
  if (existing.rowCount) return existing.rows[0];

  const freight = (await query("SELECT * FROM freights WHERE id = $1", [freightId])).rows[0];
  const action = await query(
    `INSERT INTO automation_actions (feed_id, freight_id, action, status, reason, payload)
     VALUES ($1,$2,'propose_price',$3,$4,$5)
     RETURNING *`,
    [
      match.feed.id,
      freightId,
      match.feed.auto_mode === "execute" ? "pending" : "pending",
      `Matched ${match.feed.name} (${match.score}). ${match.reasons.join(", ")}. ${match.plan.rationale.join(" ")}`,
      {
        price: match.plan.firstOffer,
        target: match.plan.target,
        autoAcceptAt: match.plan.autoAcceptAt,
        currency: match.feed.currency,
        auto_mode: match.feed.auto_mode,
        offerId: freight.trans_offer_id,
        version: 1,
      },
    ]
  );
  if (match.feed.auto_mode === "execute" && config.automationEnabled) {
    await executeAction(action.rows[0].id);
  }
  return action.rows[0];
}

export async function executeAction(actionId: string) {
  const res = await query("SELECT * FROM automation_actions WHERE id = $1", [actionId]);
  const action = res.rows[0];
  if (!action || action.status === "executed") return action;
  const payload = action.payload || {};
  const connected = Boolean(await getValidAccessToken().catch(() => null));

  try {
    let result: unknown = { simulated: !connected };
    if (connected && payload.offerId && (action.action === "propose_price" || action.action === "counter")) {
      result = await transEu.negotiate(payload.offerId, {
        payment: {
          price: {
            currency: String(payload.currency || "eur").toLowerCase(),
            type: "route",
            value: Number(payload.price),
          },
        },
        version: Number(payload.version || 1),
      });
    } else if (connected && payload.offerId && action.action === "accept") {
      result = await transEu.accept(payload.offerId, { version: Number(payload.version || 1) });
    } else if (connected && payload.offerId && action.action === "reject") {
      result = await transEu.renounce(payload.offerId, { version: Number(payload.version || 1) });
    }

    await query(
      `UPDATE automation_actions
       SET status = 'executed', result = $2, executed_at = now()
       WHERE id = $1`,
      [actionId, result]
    );

    if (action.freight_id) {
      const freight = (await query("SELECT * FROM freights WHERE id = $1", [action.freight_id])).rows[0];
      let negotiation = (
        await query("SELECT * FROM negotiations WHERE freight_id = $1 LIMIT 1", [action.freight_id])
      ).rows[0];
      if (!negotiation) {
        const inserted = await query(
          `INSERT INTO negotiations (trans_offer_id, freight_id, trans_freight_id, status, version, current_price, currency, our_role, last_action_by, auto_managed, rounds)
           VALUES ($1,$2,$3,'negotiation',1,$4,$5,'participant','automation',true,1)
           RETURNING *`,
          [
            freight?.trans_offer_id || `local-${action.freight_id}`,
            action.freight_id,
            freight?.trans_freight_id || null,
            payload.price || null,
            payload.currency || "EUR",
          ]
        );
        negotiation = inserted.rows[0];
      } else {
        await query(
          `UPDATE negotiations
           SET current_price = $2, currency = $3, rounds = rounds + 1, last_action_by = 'automation',
               auto_managed = true, status = 'negotiation', updated_at = now()
           WHERE id = $1`,
          [negotiation.id, payload.price || negotiation.current_price, payload.currency || negotiation.currency]
        );
      }
      await query(
        `INSERT INTO negotiation_events (negotiation_id, freight_id, action, price, currency, actor, source, note, payload)
         VALUES ($1,$2,$3,$4,$5,'automation',$6,$7,$8)`,
        [
          negotiation.id,
          action.freight_id,
          action.action,
          payload.price || null,
          payload.currency || "EUR",
          connected ? "trans" : "auto",
          action.reason,
          result,
        ]
      );
    }
    return (await query("SELECT * FROM automation_actions WHERE id = $1", [actionId])).rows[0];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE automation_actions SET status = 'failed', result = $2 WHERE id = $1`,
      [actionId, { error: message }]
    );
    throw err;
  }
}

export async function decideOnIncomingOffer(params: {
  freightId: string;
  offerPrice: number;
  currency: string;
  offerId?: string;
  version?: number;
  counterpart?: string;
}) {
  const match = await matchFreightToFeeds(params.freightId);
  if (!match) return null;
  const feed = match.feed as FeedRow;
  const acceptAt = match.plan.autoAcceptAt;
  const floor = match.plan.floor;
  let action = "counter";
  let price = match.plan.firstOffer;
  let reason = `Incoming ${params.offerPrice} ${params.currency}.`;

  if (acceptAt != null && params.offerPrice >= acceptAt) {
    action = "accept";
    price = params.offerPrice;
    reason += ` At/above auto-accept ${acceptAt}.`;
  } else if (floor != null && params.offerPrice < floor) {
    action = feed.auto_mode === "execute" ? "counter" : "review";
    price = nextCounter({
      current: params.offerPrice,
      target: match.plan.target || params.offerPrice,
      floor,
      ceiling: match.plan.ceiling,
      role: "owner",
      rounds: 0,
      maxRounds: feed.max_rounds,
    });
    reason += ` Below floor ${floor}. Counter to ${price}.`;
  } else {
    price = nextCounter({
      current: params.offerPrice,
      target: match.plan.target || params.offerPrice,
      floor,
      ceiling: match.plan.ceiling,
      role: "owner",
      rounds: 0,
      maxRounds: feed.max_rounds,
    });
    reason += ` Counter toward ${match.plan.target}.`;
  }

  const inserted = await query(
    `INSERT INTO automation_actions (feed_id, freight_id, action, status, reason, payload)
     VALUES ($1,$2,$3,'pending',$4,$5) RETURNING *`,
    [
      feed.id,
      params.freightId,
      action,
      reason,
      {
        price,
        currency: params.currency,
        offerId: params.offerId,
        version: params.version || 1,
        counterpart: params.counterpart,
        auto_mode: feed.auto_mode,
      },
    ]
  );
  if (feed.auto_mode === "execute" && config.automationEnabled && action !== "review") {
    return executeAction(inserted.rows[0].id);
  }
  return inserted.rows[0];
}
