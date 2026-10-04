CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'trans.eu',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  scope TEXT,
  expires_at TIMESTAMPTZ,
  trans_user_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  loading_countries TEXT[] NOT NULL DEFAULT '{}',
  loading_localities TEXT[] NOT NULL DEFAULT '{}',
  unloading_countries TEXT[] NOT NULL DEFAULT '{}',
  unloading_localities TEXT[] NOT NULL DEFAULT '{}',
  truck_bodies TEXT[] NOT NULL DEFAULT '{}',
  vehicle_sizes TEXT[] NOT NULL DEFAULT '{}',
  transport_types TEXT[] NOT NULL DEFAULT '{}',
  min_weight_t NUMERIC,
  max_weight_t NUMERIC,
  min_distance_km NUMERIC,
  max_distance_km NUMERIC,
  date_window_days INTEGER NOT NULL DEFAULT 14,
  currency TEXT NOT NULL DEFAULT 'EUR',
  target_rate_per_km NUMERIC,
  min_price NUMERIC,
  max_price NUMERIC,
  min_margin_pct NUMERIC,
  auto_accept_threshold NUMERIC,
  first_offer_discount_pct NUMERIC NOT NULL DEFAULT 8,
  max_rounds INTEGER NOT NULL DEFAULT 3,
  strategy TEXT NOT NULL DEFAULT 'moderate',
  auto_mode TEXT NOT NULL DEFAULT 'suggest',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS freights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trans_freight_id BIGINT,
  trans_offer_id TEXT,
  source TEXT NOT NULL,
  reference_number TEXT,
  status TEXT,
  shipper_name TEXT,
  shipper_vat TEXT,
  shipper_company_id BIGINT,
  loading_country TEXT,
  loading_locality TEXT,
  loading_postal TEXT,
  loading_lat NUMERIC,
  loading_lng NUMERIC,
  loading_at TIMESTAMPTZ,
  unloading_country TEXT,
  unloading_locality TEXT,
  unloading_postal TEXT,
  unloading_lat NUMERIC,
  unloading_lng NUMERIC,
  unloading_at TIMESTAMPTZ,
  distance_m INTEGER,
  weight_t NUMERIC,
  loading_meters NUMERIC,
  volume NUMERIC,
  truck_bodies TEXT[] NOT NULL DEFAULT '{}',
  vehicle_size TEXT,
  transport_type TEXT,
  ftl BOOLEAN,
  published_price NUMERIC,
  published_currency TEXT,
  price_type TEXT,
  payment_days INTEGER,
  payment_type TEXT,
  is_first_buy BOOLEAN,
  is_quick_pay BOOLEAN,
  decision_date TIMESTAMPTZ,
  publish_date TIMESTAMPTZ,
  matched_feed_id UUID REFERENCES feeds(id) ON DELETE SET NULL,
  match_score NUMERIC,
  suggested_price NUMERIC,
  suggested_currency TEXT,
  ai_summary TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS freights_trans_unique
  ON freights (source, trans_freight_id)
  WHERE trans_freight_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS freights_status_idx ON freights (status);
CREATE INDEX IF NOT EXISTS freights_feed_idx ON freights (matched_feed_id);
CREATE INDEX IF NOT EXISTS freights_loading_idx ON freights (loading_country, unloading_country);

CREATE TABLE IF NOT EXISTS negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trans_offer_id TEXT UNIQUE,
  freight_id UUID REFERENCES freights(id) ON DELETE SET NULL,
  trans_freight_id BIGINT,
  status TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  current_price NUMERIC,
  currency TEXT,
  our_role TEXT NOT NULL DEFAULT 'participant',
  last_action_by TEXT,
  was_negotiated BOOLEAN,
  counterpart_name TEXT,
  counterpart_vat TEXT,
  auto_managed BOOLEAN NOT NULL DEFAULT false,
  rounds INTEGER NOT NULL DEFAULT 0,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS negotiation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id UUID REFERENCES negotiations(id) ON DELETE CASCADE,
  freight_id UUID REFERENCES freights(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  price NUMERIC,
  currency TEXT,
  actor TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trans_order_id TEXT UNIQUE,
  trans_freight_id BIGINT,
  freight_id UUID REFERENCES freights(id) ON DELETE SET NULL,
  number TEXT,
  status TEXT,
  role TEXT NOT NULL,
  price NUMERIC,
  currency TEXT,
  payment_days INTEGER,
  shipper_name TEXT,
  carrier_name TEXT,
  loading_locality TEXT,
  unloading_locality TEXT,
  loading_at TIMESTAMPTZ,
  unloading_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  content TEXT,
  value NUMERIC,
  currency TEXT,
  author TEXT NOT NULL DEFAULT 'ops',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id UUID REFERENCES feeds(id) ON DELETE SET NULL,
  freight_id UUID REFERENCES freights(id) ON DELETE SET NULL,
  negotiation_id UUID REFERENCES negotiations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  model TEXT,
  prompt TEXT,
  response TEXT,
  entity_type TEXT,
  entity_id UUID,
  usage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  items INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trans_event_id TEXT,
  event_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  trans_id TEXT,
  route_key TEXT,
  features JSONB NOT NULL,
  outcome JSONB NOT NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_route_idx ON training_samples (route_key);
