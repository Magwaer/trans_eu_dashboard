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

async function paginate<T>(path: string, query: Query = {}, maxPages = 20): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await request<T[]>("GET", path, undefined, { ...query, page });
    if (!Array.isArray(batch) || batch.length === 0) break;
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
    paginate("/ext/freights-api/v1/freights/accepted", { sortBy: "created_at", order: "desc" }),
  getArchivedFreights: () =>
    paginate("/ext/freights-api/v1/freights/archived", { sortBy: "created_at", order: "desc" }),
  getFreight: (id: string | number) => request("GET", `/ext/freights-api/v1/freights/${id}`),
  getOffers: (freightId: string | number) =>
    request<unknown[]>("GET", `/ext/freights-api/v1/freights/${freightId}/offers`),
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
  getArchivedCreatedOrders: () => paginate("/ext/orders-api/v1/orders-created/archived"),
  getArchivedReceivedOrders: () => paginate("/ext/orders-api/v1/orders-received/archived"),
};
