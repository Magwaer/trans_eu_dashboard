async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/auth/login") {
      window.dispatchEvent(new Event("desk-locked"));
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || body.detail || res.statusText);
  }
  if (res.headers.get("content-type")?.includes("ndjson")) {
    return (await res.text()) as T;
  }
  return res.json();
}

export const api = {
  health: () => req("/api/health"),
  status: () => req<AuthStatus>("/api/auth/status"),
  login: (password: string) => req("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => req("/api/auth/logout", { method: "POST" }),
  transStart: () => req<{ url: string }>("/api/auth/trans/start"),
  dashboard: () => req<Dashboard>("/api/dashboard"),
  feeds: () => req<Feed[]>("/api/feeds"),
  saveFeed: (data: Partial<Feed>, id?: string) =>
    req<Feed>(id ? `/api/feeds/${id}` : "/api/feeds", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(data),
    }),
  deleteFeed: (id: string) => req(`/api/feeds/${id}`, { method: "DELETE" }),
  inbox: (query = "") => req<Freight[]>(`/api/inbox${query}`),
  freight: (id: string) => req<FreightDetail>(`/api/inbox/${id}`),
  addNote: (id: string, body: Record<string, unknown>) =>
    req(`/api/inbox/${id}/notes`, { method: "POST", body: JSON.stringify(body) }),
  negotiations: () => req<Negotiation[]>("/api/negotiations"),
  negotiation: (id: string) => req<{ negotiation: Negotiation; events: EventRow[] }>(`/api/negotiations/${id}`),
  negotiate: (id: string, action: string, body: Record<string, unknown> = {}) =>
    req(`/api/negotiations/${id}/${action}`, { method: "POST", body: JSON.stringify(body) }),
  orders: () => req<Order[]>("/api/orders"),
  actions: () => req<ActionRow[]>("/api/actions"),
  approveAction: (id: string) => req(`/api/actions/${id}/approve`, { method: "POST" }),
  cancelAction: (id: string) => req(`/api/actions/${id}/cancel`, { method: "POST" }),
  sync: () => req("/api/sync", { method: "POST" }),
  historic: () => req<Historic>("/api/historic"),
  pullHistoric: () => req("/api/historic/pull", { method: "POST" }),
  price: (freightId: string) => req("/api/ai/price", { method: "POST", body: JSON.stringify({ freightId }) }),
  reply: (body: Record<string, unknown>) => req<{ text: string; model: string }>("/api/ai/reply", { method: "POST", body: JSON.stringify(body) }),
  analyze: (question: string) => req<{ text: string; model: string }>("/api/ai/analyze", { method: "POST", body: JSON.stringify({ question }) }),
};

export type AuthStatus = {
  dashboard: boolean;
  unlocked?: boolean;
  anthropic: boolean;
  trans: {
    configured: boolean;
    connected: boolean;
    expiresAt: string | null;
    scope: string | null;
    notes: string[];
    rateLimits: { tokenRps: number; apiRps: number };
  };
};

export type Dashboard = {
  feeds: number;
  freights: { n: number; proposals: number; own: number; matched: number };
  negotiations: { n: number; open: number };
  orders: number;
  actions: { pending: number; executed: number };
  training: number;
  lanes: Array<{ loading_country: string; unloading_country: string; n: number; avg_price: string }>;
  syncs: Array<{ kind: string; status: string; items: number; error?: string; started_at: string }>;
};

export type Feed = {
  id?: string;
  name: string;
  enabled: boolean;
  loading_countries: string[];
  loading_localities: string[];
  unloading_countries: string[];
  unloading_localities: string[];
  truck_bodies: string[];
  vehicle_sizes: string[];
  transport_types: string[];
  min_weight_t: number | null;
  max_weight_t: number | null;
  min_distance_km: number | null;
  max_distance_km: number | null;
  date_window_days: number;
  currency: string;
  target_rate_per_km: number | null;
  min_price: number | null;
  max_price: number | null;
  auto_accept_threshold: number | null;
  first_offer_discount_pct: number;
  max_rounds: number;
  strategy: "aggressive" | "moderate" | "conservative";
  auto_mode: "off" | "suggest" | "execute";
  notes?: string | null;
  watched?: number;
};

export type Freight = {
  id: string;
  source: string;
  reference_number: string;
  status: string;
  shipper_name: string;
  loading_country: string;
  loading_locality: string;
  unloading_country: string;
  unloading_locality: string;
  loading_at: string;
  unloading_at: string;
  distance_m: number;
  weight_t: number;
  truck_bodies: string[];
  published_price: number;
  published_currency: string;
  suggested_price: number;
  suggested_currency: string;
  match_score: number;
  feed_name?: string;
  auto_mode?: string;
  strategy?: string;
  ai_summary?: string;
  is_quick_pay?: boolean;
  is_first_buy?: boolean;
  payment_days?: number;
};

export type FreightDetail = {
  freight: Freight;
  notes: Array<{ id: string; kind: string; content: string; value: number; currency: string; author: string; created_at: string }>;
  actions: ActionRow[];
  negotiations: Negotiation[];
};

export type Negotiation = {
  id: string;
  status: string;
  current_price: number;
  currency: string;
  our_role: string;
  counterpart_name: string;
  rounds: number;
  auto_managed: boolean;
  loading_locality?: string;
  unloading_locality?: string;
  published_price?: number;
  suggested_price?: number;
  feed_name?: string;
  last_action_by?: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  action: string;
  price: number;
  currency: string;
  actor: string;
  source: string;
  note: string;
  created_at: string;
};

export type Order = {
  id: string;
  number: string;
  status: string;
  role: string;
  price: number;
  currency: string;
  shipper_name: string;
  carrier_name: string;
  loading_locality: string;
  unloading_locality: string;
  loading_at: string;
  payment_days: number;
};

export type ActionRow = {
  id: string;
  action: string;
  status: string;
  reason: string;
  payload: { price?: number; currency?: string };
  feed_name?: string;
  loading_locality?: string;
  unloading_locality?: string;
  created_at: string;
};

export type Historic = {
  samples: Array<{ id: string; source: string; route_key: string; features: Record<string, unknown>; outcome: Record<string, unknown>; created_at: string }>;
  freights: Freight[];
};

export function money(v?: number | string | null, c = "EUR") {
  if (v == null || v === "") return "—";
  return `${Number(v).toFixed(0)} ${c}`;
}

export function km(m?: number | null) {
  if (!m) return "—";
  return `${Math.round(m / 1000)} km`;
}

export function when(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function lane(row: { loading_locality?: string; loading_country?: string; unloading_locality?: string; unloading_country?: string }) {
  return `${row.loading_locality || "?"} ${(row.loading_country || "").toUpperCase()} → ${row.unloading_locality || "?"} ${(row.unloading_country || "").toUpperCase()}`;
}
