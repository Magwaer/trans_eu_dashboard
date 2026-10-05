import { config } from "../config.js";
import { apiLimiter } from "../lib/rateLimiter.js";
import { getValidAccessToken } from "./transEuAuth.js";

type Query = Record<string, string | number | undefined>;

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Trans.eu is not connected. Complete OAuth first.");
  await apiLimiter.take();

  const url = new URL(path, config.trans.apiBase);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Api-key": config.trans.apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1000));
    return request<T>(method, path, body, query);
  }

  if (res.status === 204) return null as T;
  const json = (await res.json().catch(() => ({}))) as T & { detail?: string; title?: string };
  if (!res.ok) {
    throw new Error(json.detail || json.title || `${method} ${path} failed (${res.status})`);
  }
  return json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asItemList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload.filter((item) => isRecord(item) && !("next_order" in item && !("id" in item))) as T[];
  }
  if (isRecord(payload)) {
    for (const key of ["orders", "freights", "freight_proposals", "items", "data", "results"]) {
      if (Array.isArray(payload[key])) return asItemList<T>(payload[key]);
    }
  }
  return [];
}

function isNotFound(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /page not found/i.test(message) || /not found/i.test(message);
}

async function paginate<T>(path: string, query: Query = {}, maxPages = 20): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    let payload: unknown;
    try {
      payload = await request<unknown>("GET", path, undefined, { ...query, page });
    } catch (err) {
      if (page > 1 && isNotFound(err)) break;
      throw err;
    }
    const batch = asItemList<T>(payload);
    if (batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 30) break;
  }
  return items;
}

export const transEu = {
  getFreights: (filter?: string) =>
    paginate("/ext/freights-api/v1/freights", {
      sortBy: "created_at",
      order: "desc",
      filter,
    }),
  getAcceptedFreights: () =>
    paginate("/ext/freights-api/v1/accepted", { sortBy: "created_at", order: "desc" }),
  getArchivedFreights: () =>
    paginate("/ext/freights-api/v1/archive", { sortBy: "created_at", order: "desc" }),
  getFreight: (id: string | number) => request("GET", `/ext/freights-api/v1/freights/${id}`),
  getOffers: async (freightId: string | number) =>
    asItemList(await request("GET", `/ext/freights-api/v1/freights/${freightId}/offers`)),
  getOffer: (offerId: string) => request("GET", `/ext/freights-api/v1/freights/offers/${offerId}`),
  getProposals: () =>
    paginate("/ext/freights-api/v2/freight-proposals", { sortBy: "loading_date", order: "desc" }),
  getProposal: (freightId: string | number) =>
    request("GET", `/ext/freights-api/v2/freight-proposals/${freightId}`),
  getAcceptedProposals: () => paginate("/ext/freights-api/v1/freight-proposals/accepted"),
  getArchivedProposals: () => paginate("/ext/freights-api/v1/freight-proposals/archived"),
  negotiate: (offerId: string, body: Record<string, unknown>) =>
    request("PATCH", `/ext/freights-api/v1/freights/offers/${offerId}/negotiate`, body),
  accept: (offerId: string, body: Record<string, unknown>) =>
    request("POST", `/ext/freights-api/v1/freights/offers/${offerId}/accept`, body),
  renounce: (offerId: string, body: Record<string, unknown>) =>
    request("POST", `/ext/freights-api/v1/freights/offers/${offerId}/renouncement`, body),
  withdraw: (offerId: string, body: Record<string, unknown>) =>
    request("POST", `/ext/freights-api/v1/freights/offers/${offerId}/withdraw`, body),
  reject: (offerId: string, body: Record<string, unknown>) =>
    request("POST", `/ext/freights-api/v1/freights/offers/${offerId}/reject`, body),
  getCreatedOrders: (filter?: string) =>
    paginate("/ext/orders-api/v1/orders-created", { filter }),
  getReceivedOrders: (filter?: string) =>
    paginate("/ext/orders-api/v1/orders-received", { filter }),
  getArchivedCreatedOrders: () => paginate("/ext/orders-api/v1/archive-orders-created"),
  getArchivedReceivedOrders: () => paginate("/ext/orders-api/v1/archive-orders-received"),
};
