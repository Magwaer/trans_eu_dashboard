import { query } from "../db/pool.js";
import { flattenFreight, routeKey } from "../lib/normalize.js";
import { enqueueForFreight } from "./automation.js";

export async function upsertFreight(raw: Record<string, unknown>, source: string, auto = true) {
  const f = flattenFreight(raw, source);
  const existing = f.trans_freight_id
    ? await query<{ id: string }>(
        `SELECT id FROM freights WHERE source = $1 AND trans_freight_id = $2`,
        [source, f.trans_freight_id]
      )
    : { rows: [] as { id: string }[] };

  const params = [
    f.trans_freight_id,
    f.trans_offer_id,
    source,
    f.reference_number,
    f.status,
    f.shipper_name,
    f.shipper_vat,
    f.shipper_company_id,
    f.loading_country,
    f.loading_locality,
    f.loading_postal,
    f.loading_lat,
    f.loading_lng,
    f.loading_at,
    f.unloading_country,
    f.unloading_locality,
    f.unloading_postal,
    f.unloading_lat,
    f.unloading_lng,
    f.unloading_at,
    f.distance_m,
    f.weight_t,
    f.loading_meters,
    f.volume,
    f.truck_bodies,
    f.vehicle_size,
    f.transport_type,
    f.ftl,
    f.published_price,
    f.published_currency,
    f.price_type,
    f.payment_days,
    f.payment_type,
    f.is_first_buy,
    f.is_quick_pay,
    f.decision_date,
    f.publish_date,
    f.raw,
  ];

  let id: string;
  if (existing.rows[0]) {
    id = existing.rows[0].id;
    await query(
      `UPDATE freights SET
        trans_offer_id=$2, reference_number=$4, status=$5, shipper_name=$6, shipper_vat=$7,
        shipper_company_id=$8, loading_country=$9, loading_locality=$10, loading_postal=$11,
        loading_lat=$12, loading_lng=$13, loading_at=$14, unloading_country=$15,
        unloading_locality=$16, unloading_postal=$17, unloading_lat=$18, unloading_lng=$19,
        unloading_at=$20, distance_m=$21, weight_t=$22, loading_meters=$23, volume=$24,
        truck_bodies=$25, vehicle_size=$26, transport_type=$27, ftl=$28, published_price=$29,
        published_currency=$30, price_type=$31, payment_days=$32, payment_type=$33,
        is_first_buy=$34, is_quick_pay=$35, decision_date=$36, publish_date=$37, raw=$38,
        last_synced_at=now(), updated_at=now()
       WHERE id=$39`,
      [...params, id]
    );
  } else {
    const inserted = await query<{ id: string }>(
      `INSERT INTO freights (
        trans_freight_id, trans_offer_id, source, reference_number, status, shipper_name,
        shipper_vat, shipper_company_id, loading_country, loading_locality, loading_postal,
        loading_lat, loading_lng, loading_at, unloading_country, unloading_locality,
        unloading_postal, unloading_lat, unloading_lng, unloading_at, distance_m, weight_t,
        loading_meters, volume, truck_bodies, vehicle_size, transport_type, ftl,
        published_price, published_currency, price_type, payment_days, payment_type,
        is_first_buy, is_quick_pay, decision_date, publish_date, raw, last_synced_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
        $25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38, now()
      ) RETURNING id`,
      params
    );
    id = inserted.rows[0].id;
  }

  if (auto && source !== "historic") {
    await enqueueForFreight(id);
  }
  return id;
}

export async function upsertNegotiation(raw: Record<string, unknown>, freightId?: string) {
  const offerId = String(raw.id || raw.offer_id || "");
  if (!offerId) return null;
  const price = (raw.price as { value?: number; currency?: string }) || {};
  const existing = await query<{ id: string }>(
    "SELECT id FROM negotiations WHERE trans_offer_id = $1",
    [offerId]
  );
  const fields = [
    offerId,
    freightId || null,
    raw.freight_id || (raw.freight as { id?: number } | undefined)?.id || null,
    raw.status || "negotiation",
    raw.version || 1,
    price.value ?? null,
    (price.currency || "EUR").toString().toUpperCase(),
    raw.our_role || "participant",
    (raw.carrier as { legal_name?: string } | undefined)?.legal_name ||
      (raw.legal_name as string) ||
      null,
    (raw.carrier as { vat_id?: string } | undefined)?.vat_id || (raw.vat_id as string) || null,
    raw,
  ];
  if (existing.rows[0]) {
    await query(
      `UPDATE negotiations SET freight_id=COALESCE($2, freight_id), trans_freight_id=$3,
        status=$4, version=$5, current_price=$6, currency=$7, counterpart_name=$9,
        counterpart_vat=$10, raw=$11, last_synced_at=now(), updated_at=now()
       WHERE id=$12`,
      [...fields, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const inserted = await query<{ id: string }>(
    `INSERT INTO negotiations (
      trans_offer_id, freight_id, trans_freight_id, status, version, current_price,
      currency, our_role, counterpart_name, counterpart_vat, raw, last_synced_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now()) RETURNING id`,
    fields
  );
  return inserted.rows[0].id;
}

function asOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asText(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && "value" in value) {
    const inner = (value as { value?: unknown }).value;
    return inner == null ? null : String(inner);
  }
  return null;
}

export async function upsertOrder(raw: Record<string, unknown>, role: "created" | "received") {
  if (!isRecord(raw) || raw.next_order != null && raw.id == null) return null;
  const freight = isRecord(raw.freight) ? raw.freight : {};
  const shipper = isRecord(freight.shipper) ? freight.shipper : {};
  const carrier = isRecord(freight.carrier) ? freight.carrier : {};
  const payment = isRecord(raw.payment) ? raw.payment : {};
  const price = isRecord(payment.price) ? payment.price : {};
  const spots = Array.isArray(freight.spots) ? freight.spots : [];
  const load = spots.find((s) => isRecord(s) && Array.isArray(s.operations) && s.operations.some((o) => isRecord(o) && o.type === "loading"));
  const unload = spots.find((s) => isRecord(s) && Array.isArray(s.operations) && s.operations.some((o) => isRecord(o) && o.type === "unloading"));
  const transId = raw.id != null && raw.id !== "" ? String(raw.id) : "";
  if (!transId) return null;
  const existing = await query<{ id: string }>("SELECT id FROM orders WHERE trans_order_id = $1::text", [transId]);
  const values = [
    transId,
    asOptionalNumber(raw.legacy_freight_id ?? freight.id),
    asText(raw.number),
    asText(raw.status),
    role,
    asOptionalNumber(price.value),
    asText(price.currency)?.toUpperCase() || "EUR",
    asOptionalNumber(payment.days),
    asText(shipper.legal_name),
    asText(carrier.legal_name),
    asText(isRecord(load) && isRecord(load.place) && isRecord(load.place.address) ? load.place.address.locality : null),
    asText(isRecord(unload) && isRecord(unload.place) && isRecord(unload.place.address) ? unload.place.address.locality : null),
    spotBegin(load, "loading"),
    spotBegin(unload, "unloading"),
    raw,
  ];
  if (existing.rows[0]) {
    await query(
      `UPDATE orders SET trans_freight_id=$2::bigint, number=$3::text, status=$4::text, role=$5::text, price=$6::numeric,
        currency=$7::text, payment_days=$8::int, shipper_name=$9::text, carrier_name=$10::text,
        loading_locality=$11::text, unloading_locality=$12::text, loading_at=$13::timestamptz, unloading_at=$14::timestamptz,
        raw=$15::jsonb, last_synced_at=now(), updated_at=now()
       WHERE id=$16::uuid`,
      [...values, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const inserted = await query<{ id: string }>(
    `INSERT INTO orders (
      trans_order_id, trans_freight_id, number, status, role, price, currency,
      payment_days, shipper_name, carrier_name, loading_locality, unloading_locality,
      loading_at, unloading_at, raw, last_synced_at
    ) VALUES (
      $1::text,$2::bigint,$3::text,$4::text,$5::text,$6::numeric,$7::text,$8::int,
      $9::text,$10::text,$11::text,$12::text,$13::timestamptz,$14::timestamptz,$15::jsonb, now()
    ) RETURNING id`,
    values
  );
  return inserted.rows[0].id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function spotBegin(spot: unknown, type: string): string | null {
  if (!isRecord(spot) || !Array.isArray(spot.operations)) return null;
  const op = spot.operations.find((item) => isRecord(item) && item.type === type);
  if (!isRecord(op) || !isRecord(op.timespans)) return null;
  return asText(op.timespans.begin);
}

export async function recordTraining(raw: Record<string, unknown>, source: string, outcome: Record<string, unknown>) {
  const flat = flattenFreight(raw, source);
  await query(
    `INSERT INTO training_samples (source, trans_id, route_key, features, outcome, raw)
     VALUES ($1::text,$2::text,$3::text,$4::jsonb,$5::jsonb,$6::jsonb)`,
    [
      source,
      String(flat.trans_freight_id || flat.trans_offer_id || ""),
      routeKey(flat),
      {
        loading_country: flat.loading_country,
        loading_locality: flat.loading_locality,
        unloading_country: flat.unloading_country,
        unloading_locality: flat.unloading_locality,
        distance_km: flat.distance_m ? flat.distance_m / 1000 : null,
        weight_t: flat.weight_t,
        truck_bodies: flat.truck_bodies,
        vehicle_size: flat.vehicle_size,
        published_price: flat.published_price,
        currency: flat.published_currency,
        payment_days: flat.payment_days,
        loading_at: flat.loading_at,
      },
      outcome,
      raw,
    ]
  );
}
