import { query } from "../db/pool.js";
import { transEu } from "./transEuClient.js";
import { getValidAccessToken } from "./transEuAuth.js";
import { recordTraining, upsertFreight, upsertNegotiation, upsertOrder } from "./persist.js";
import { decideOnIncomingOffer } from "./automation.js";

async function runKind(kind: string, fn: () => Promise<number>) {
  const inserted = await query<{ id: string }>(
    `INSERT INTO sync_runs (kind, status) VALUES ($1, 'running') RETURNING id`,
    [kind]
  );
  const id = inserted.rows[0].id;
  try {
    const items = await fn();
    await query(
      `UPDATE sync_runs SET status='ok', items=$2, finished_at=now() WHERE id=$1`,
      [id, items]
    );
    return { kind, items, status: "ok" as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE sync_runs SET status='error', error=$2, finished_at=now() WHERE id=$1`,
      [id, message]
    );
    return { kind, items: 0, status: "error" as const, error: message };
  }
}

export async function syncLive() {
  const token = await getValidAccessToken().catch(() => null);
  if (!token) {
    return [{ kind: "all", items: 0, status: "skipped" as const, error: "Trans.eu not connected" }];
  }

  const results = [];
  results.push(
    await runKind("proposals", async () => {
      const list = (await transEu.getProposals()) as Record<string, unknown>[];
      for (const item of list) {
        await upsertFreight(item, "proposal");
      }
      return list.length;
    })
  );
  results.push(
    await runKind("own-freights", async () => {
      const list = (await transEu.getFreights()) as Record<string, unknown>[];
      for (const item of list) {
        const id = await upsertFreight(item, "own", false);
        try {
          const offers = (await transEu.getOffers(item.id as number)) as Record<string, unknown>[];
          for (const offer of offers) {
            await upsertNegotiation(offer, id);
            const price = (offer.price as { value?: number; currency?: string }) || {};
            if (price.value) {
              await decideOnIncomingOffer({
                freightId: id,
                offerPrice: Number(price.value),
                currency: (price.currency || "EUR").toUpperCase(),
                offerId: String(offer.id || ""),
                version: Number(offer.version || 1),
                counterpart: (offer.legal_name as string) || undefined,
              });
            }
          }
        } catch {
          // Offer list can fail for unpublished freights.
        }
      }
      return list.length;
    })
  );
  results.push(
    await runKind("orders", async () => {
      const created = (await transEu.getCreatedOrders()) as Record<string, unknown>[];
      const received = (await transEu.getReceivedOrders()) as Record<string, unknown>[];
      for (const item of created) await upsertOrder(item, "created");
      for (const item of received) await upsertOrder(item, "received");
      return created.length + received.length;
    })
  );
  return results;
}

export async function pullHistoric() {
  const token = await getValidAccessToken().catch(() => null);
  if (!token) {
    return { status: "skipped", error: "Trans.eu not connected", items: 0 };
  }
  return runKind("historic", async () => {
    let count = 0;
    const archivedFreights = (await transEu.getArchivedFreights()) as Record<string, unknown>[];
    for (const item of archivedFreights) {
      await upsertFreight(item, "historic", false);
      await recordTraining(item, "archived_freight", {
        status: item.status,
        accepted_price: (item as { publication?: { price?: { value?: number } } }).publication?.price?.value ?? null,
      });
      count += 1;
    }
    const acceptedFreights = (await transEu.getAcceptedFreights()) as Record<string, unknown>[];
    for (const item of acceptedFreights) {
      await upsertFreight(item, "historic", false);
      await recordTraining(item, "accepted_freight", {
        status: "accepted",
        accepted_price: (item as { publication?: { price?: { value?: number } } }).publication?.price?.value ?? null,
      });
      count += 1;
    }
    const archivedProposals = (await transEu.getArchivedProposals()) as Record<string, unknown>[];
    for (const item of archivedProposals) {
      await upsertFreight(item, "historic", false);
      const price = (item.price as { value?: number }) || {};
      await recordTraining(item, "archived_proposal", { status: item.status, accepted_price: price.value ?? null });
      count += 1;
    }
    const acceptedProposals = (await transEu.getAcceptedProposals()) as Record<string, unknown>[];
    for (const item of acceptedProposals) {
      await upsertFreight(item, "historic", false);
      const price = (item.price as { value?: number }) || {};
      await recordTraining(item, "accepted_proposal", { status: "accepted", accepted_price: price.value ?? null });
      count += 1;
    }
    try {
      const archivedCreated = (await transEu.getArchivedCreatedOrders()) as Record<string, unknown>[];
      const archivedReceived = (await transEu.getArchivedReceivedOrders()) as Record<string, unknown>[];
      for (const item of [...archivedCreated, ...archivedReceived]) {
        await upsertOrder(item, item === archivedCreated[0] ? "created" : "received");
        const payment = (item.payment as { price?: { value?: number; currency?: string } }) || {};
        await recordTraining(item, "archived_order", {
          status: (item.status as { value?: string })?.value || item.status,
          accepted_price: payment.price?.value ?? null,
          currency: payment.price?.currency ?? null,
        });
        count += 1;
      }
    } catch {
      // archived order endpoints may be unavailable on some accounts
    }
    return count;
  });
}

export async function recentSyncs() {
  const res = await query("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 20");
  return res.rows;
}
