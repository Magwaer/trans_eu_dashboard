import { pool, query } from "./pool.js";

async function seed() {
  const existing = await query("SELECT count(*)::int AS n FROM feeds");
  if (existing.rows[0].n > 0) {
    console.log("Database already seeded.");
    await pool.end();
    return;
  }

  const feeds = await query<{ id: string }>(
    `INSERT INTO feeds (
      name, enabled, loading_countries, loading_localities, unloading_countries,
      unloading_localities, truck_bodies, vehicle_sizes, transport_types,
      min_weight_t, max_weight_t, min_distance_km, max_distance_km, date_window_days,
      currency, target_rate_per_km, min_price, max_price, auto_accept_threshold,
      first_offer_discount_pct, max_rounds, strategy, auto_mode, notes
    ) VALUES
    ('PL → DE curtainsider', true, '{pl}','{Wrocław,Poznań,Łódź}','{de}','{Berlin,Hamburg,Munich}',
      '{curtainsider}','{solo,lorry}','{ftl}',18,25,300,1200,16,'EUR',1.15,780,1400,1100,7,3,'moderate','suggest',
      'Core westbound FTL. Prefer 21-24t, 13.6 curtainsider.'),
    ('IT → PL return', true, '{it}','{Milan,Verona,Padua}','{pl}','{Szczecin,Wrocław,Warsaw}',
      '{curtainsider,box}','{solo}','{ftl}',10,25,700,1600,12,'EUR',0.95,900,1600,1300,10,4,'aggressive','execute',
      'Empty-return hunter. Auto-counter if rate holds above 0.95 EUR/km.'),
    ('DE → FR groupage', true, '{de}','{Cologne,Düsseldorf}','{fr}','{Paris,Lille}',
      '{box,curtainsider}','{solo}','{ltl,ftl}',2,12,300,900,10,'EUR',1.35,420,900,720,6,3,'conservative','suggest',
      'Partial loads, tighter margin, human confirm before send.')
    RETURNING id`
  );

  const [plde, itpl, defr] = feeds.rows;

  await query(
    `INSERT INTO freights (
      trans_freight_id, trans_offer_id, source, reference_number, status, shipper_name, shipper_vat,
      loading_country, loading_locality, loading_postal, loading_lat, loading_lng, loading_at,
      unloading_country, unloading_locality, unloading_postal, unloading_lat, unloading_lng, unloading_at,
      distance_m, weight_t, truck_bodies, vehicle_size, transport_type, ftl, published_price,
      published_currency, price_type, payment_days, payment_type, is_first_buy, is_quick_pay,
      decision_date, matched_feed_id, match_score, suggested_price, suggested_currency, ai_summary, raw
    ) VALUES
    (3891981, 'f9ba62c5-c252-49e9-96f0-6360384a13d8', 'proposal', 'FR/2026/09/17/2NTS', 'active',
      'NordLog GmbH', 'DE812345678', 'pl','Wrocław','54-128',51.1423,16.9375,'2026-09-19T06:00:00+02:00',
      'de','Berlin','10178',52.52,13.405,'2026-09-19T18:00:00+02:00',
      345000,24,'{curtainsider}','solo','ftl',true,980,'EUR','route',30,'deferred',false,false,
      '2026-09-18T16:00:00+02:00', $1, 88, 911, 'EUR', 'Solid westbound. Historic lane closes 1.05-1.20 EUR/km.', '{}'),
    (3892104, 'a11c0e7d-2b44-4c1a-9c0a-111111111111', 'proposal', 'FR/2026/09/17/2N0X', 'active',
      'Oder Transit', 'PL8370257415', 'pl','Poznań','60-001',52.4064,16.9252,'2026-09-20T08:00:00+02:00',
      'de','Hamburg','20095',53.5511,9.9937,'2026-09-21T12:00:00+02:00',
      478000,22,'{curtainsider}','solo','ftl',true,1180,'EUR','route',21,'deferred',false,true,
      '2026-09-18T12:00:00+02:00', $1, 84, 1097, 'EUR', 'QuickPay. Worth a first counter near 1.10/km.', '{}'),
    (3890892, 'b22c0e7d-2b44-4c1a-9c0a-222222222222', 'proposal', 'FR/2026/09/16/ITPL', 'active',
      'Tran Export', 'PL8370257415', 'it','Milan','20097',45.3972,9.2166,'2026-09-18T15:00:00+02:00',
      'pl','Szczecin','70-001',53.3891,14.5149,'2026-09-20T08:00:00+02:00',
      1219000,24,'{curtainsider}','solo','ftl',true,650,'EUR','route',11,'deferred',false,false,
      '2026-09-18T08:00:00+02:00', $2, 91, 1047, 'EUR', 'Published 0.53/km is too low. Auto desk should counter hard.', '{}'),
    (3893001, 'c33c0e7d-2b44-4c1a-9c0a-333333333333', 'own', 'FR/2026/09/17/OWN1', 'in_progress',
      'Our desk', 'PL1111111111', 'de','Cologne','50667',50.9375,6.9603,'2026-09-21T07:00:00+02:00',
      'fr','Paris','75001',48.8566,2.3522,'2026-09-21T20:00:00+02:00',
      500000,8,'{box}','solo','ltl',false,720,'EUR','route',14,'deferred',false,false,
      '2026-09-19T18:00:00+02:00', $3, 80, 720, 'EUR', 'Own publication. Two carriers already in.', '{}'),
    (3800100, 'hist-1', 'historic', 'FR/2026/08/12/H1', 'accepted',
      'NordLog GmbH', 'DE812345678', 'pl','Wrocław','54-128',51.1423,16.9375,'2026-08-14T06:00:00+02:00',
      'de','Berlin','10178',52.52,13.405,'2026-08-14T18:00:00+02:00',
      345000,24,'{curtainsider}','solo','ftl',true,1020,'EUR','route',30,'deferred',false,false,
      null, $1, 90, 1020, 'EUR', 'Closed historic.', '{}'),
    (3800101, 'hist-2', 'historic', 'FR/2026/08/20/H2', 'accepted',
      'Po Valley Logistics', 'IT0099887766', 'it','Verona','37121',45.4384,10.9916,'2026-08-22T10:00:00+02:00',
      'pl','Wrocław','54-128',51.1423,16.9375,'2026-08-24T08:00:00+02:00',
      980000,23,'{curtainsider}','solo','ftl',true,1180,'EUR','route',14,'deferred',false,false,
      null, $2, 86, 1180, 'EUR', 'Closed historic.', '{}')
    `,
    [plde.id, itpl.id, defr.id]
  );

  const freightRows = await query<{ id: string; trans_freight_id: string }>(
    "SELECT id, trans_freight_id FROM freights ORDER BY created_at"
  );
  const byTrans = Object.fromEntries(freightRows.rows.map((r) => [String(r.trans_freight_id), r.id]));

  await query(
    `INSERT INTO negotiations (
      trans_offer_id, freight_id, trans_freight_id, status, version, current_price, currency,
      our_role, last_action_by, was_negotiated, counterpart_name, auto_managed, rounds, raw
    ) VALUES
    ('neg-own-1', $1, 3893001, 'negotiation', 3, 690, 'EUR', 'owner', 'carrier', true, 'Rhine Haul', false, 2, '{}'),
    ('neg-itpl-1', $2, 3890892, 'negotiation', 2, 820, 'EUR', 'participant', 'automation', true, 'Tran Export', true, 1, '{}')`,
    [byTrans["3893001"], byTrans["3890892"]]
  );

  const negs = await query<{ id: string; trans_offer_id: string }>("SELECT id, trans_offer_id FROM negotiations");
  const negBy = Object.fromEntries(negs.rows.map((r) => [r.trans_offer_id, r.id]));

  await query(
    `INSERT INTO negotiation_events (negotiation_id, freight_id, action, price, currency, actor, source, note)
     VALUES
     ($1, $3, 'propose_price', 640, 'EUR', 'Rhine Haul', 'trans', 'First carrier offer'),
     ($1, $3, 'counter', 740, 'EUR', 'ops', 'manual', 'Hold 1.48/km on groupage'),
     ($1, $3, 'counter', 690, 'EUR', 'Rhine Haul', 'trans', 'Came up 50'),
     ($2, $4, 'propose_price', 820, 'EUR', 'automation', 'auto', 'Aggressive return-lane opener')`,
    [negBy["neg-own-1"], negBy["neg-itpl-1"], byTrans["3893001"], byTrans["3890892"]]
  );

  await query(
    `INSERT INTO orders (
      trans_order_id, trans_freight_id, freight_id, number, status, role, price, currency,
      payment_days, shipper_name, carrier_name, loading_locality, unloading_locality,
      loading_at, unloading_at, raw
    ) VALUES
    ('ord-1', 3800100, $1, 'TO/2026/08/14/AA1', 'delivery-confirmed', 'received', 1020, 'EUR', 30,
      'NordLog GmbH', 'Our fleet', 'Wrocław', 'Berlin', '2026-08-14T06:00:00+02:00', '2026-08-14T18:00:00+02:00', '{}'),
    ('ord-2', 3800101, $2, 'TO/2026/08/22/BB2', 'waiting-for-confirmation', 'received', 1180, 'EUR', 14,
      'Po Valley Logistics', 'Our fleet', 'Verona', 'Wrocław', '2026-08-22T10:00:00+02:00', '2026-08-24T08:00:00+02:00', '{}')`,
    [byTrans["3800100"], byTrans["3800101"]]
  );

  await query(
    `INSERT INTO notes (entity_type, entity_id, kind, content, value, currency, author) VALUES
     ('freight', $1, 'note', 'Driver prefers morning loading at Bielany ramp.', null, null, 'dispatcher'),
     ('freight', $1, 'cost', 'Toll + ferry estimate', 86, 'EUR', 'ops'),
     ('freight', $2, 'decision', 'Do not accept below 1000. Empty km from Poznań is 140.', 1000, 'EUR', 'lead'),
     ('freight', $3, 'price_override', 'Manual floor after diesel spike', 1000, 'EUR', 'lead')`,
    [byTrans["3891981"], byTrans["3892104"], byTrans["3890892"]]
  );

  await query(
    `INSERT INTO automation_actions (feed_id, freight_id, action, status, reason, payload, executed_at)
     VALUES
     ($2, $3, 'propose_price', 'executed', 'Matched IT → PL return (91). Aggressive first offer.', '{"price":820,"currency":"EUR"}', now()),
     ($1, $4, 'propose_price', 'pending', 'Matched PL → DE curtainsider (88). Waiting for human confirm.', '{"price":911,"currency":"EUR"}', null)`,
    [plde.id, itpl.id, byTrans["3890892"], byTrans["3891981"]]
  );

  await query(
    `INSERT INTO training_samples (source, trans_id, route_key, features, outcome) VALUES
     ('accepted_freight', '3800100', 'pl>wrocław>de>berlin',
      '{"distance_km":345,"weight_t":24,"truck_bodies":["curtainsider"],"published_price":980,"currency":"EUR"}',
      '{"status":"accepted","accepted_price":1020}'),
     ('accepted_proposal', '3800101', 'it>verona>pl>wrocław',
      '{"distance_km":980,"weight_t":23,"truck_bodies":["curtainsider"],"published_price":1100,"currency":"EUR"}',
      '{"status":"accepted","accepted_price":1180}'),
     ('archived_freight', '3800090', 'pl>poznań>de>hamburg',
      '{"distance_km":478,"weight_t":22,"truck_bodies":["curtainsider"],"published_price":1250,"currency":"EUR"}',
      '{"status":"lost","accepted_price":null}'),
     ('accepted_freight', '3800088', 'de>cologne>fr>paris',
      '{"distance_km":500,"weight_t":8,"truck_bodies":["box"],"published_price":690,"currency":"EUR"}',
      '{"status":"accepted","accepted_price":705}')`
  );

  await query(
    `INSERT INTO settings (key, value) VALUES
     ('desk', '{"name":"TNL Trans desk","default_currency":"EUR","auto_sync":true}'),
     ('automation', '{"enabled":true,"require_human_for_accept":true}')
     ON CONFLICT (key) DO NOTHING`
  );

  console.log("Seeded demo feeds, freights, negotiations, orders, and training samples.");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
