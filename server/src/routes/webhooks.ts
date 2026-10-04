import { Router } from "express";
import { query } from "../db/pool.js";
import { transEu } from "../services/transEuClient.js";
import { upsertFreight } from "../services/persist.js";
import { decideOnIncomingOffer } from "../services/automation.js";

export const webhookRouter = Router();

webhookRouter.post("/trans", async (req, res) => {
  const payload = req.body || {};
  await query(
    `INSERT INTO webhook_events (trans_event_id, event_name, occurred_at, payload)
     VALUES ($1,$2,$3,$4)`,
    [payload.id ? String(payload.id) : null, payload.event_name || "unknown", payload.occurred_at || null, payload]
  );

  try {
    const event = String(payload.event_name || "").replace(/[{}]/g, "");
    const freightId = payload.id;
    if (freightId && event.startsWith("freights.")) {
      try {
        const raw = (await transEu.getFreight(freightId)) as Record<string, unknown>;
        const id = await upsertFreight(raw, "own", false);
        if (event.includes("proposal_request") && payload.data?.price) {
          await decideOnIncomingOffer({
            freightId: id,
            offerPrice: Number(payload.data.price),
            currency: "EUR",
            counterpart: payload.data.author,
          });
        }
      } catch {
        // Token may be missing in local/dev; event is still stored.
      }
    }
    await query(
      `UPDATE webhook_events SET processed = true WHERE trans_event_id = $1 AND event_name = $2`,
      [payload.id ? String(payload.id) : null, payload.event_name || "unknown"]
    );
  } catch (err) {
    console.error("Webhook processing failed", err);
  }

  res.json({ ok: true });
});
