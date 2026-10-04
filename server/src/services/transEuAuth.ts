import crypto from "node:crypto";
import { config, transConfigured } from "../config.js";
import { query } from "../db/pool.js";
import { tokenLimiter } from "../lib/rateLimiter.js";

export function buildAuthUrl(state: string) {
  const url = new URL(config.trans.authUrl);
  url.searchParams.set("client_id", config.trans.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.trans.redirectUri);
  return url.toString();
}

export async function createOauthState() {
  const state = crypto.randomBytes(16).toString("hex");
  await query("INSERT INTO oauth_states (state) VALUES ($1)", [state]);
  return state;
}

export async function consumeOauthState(state: string) {
  const res = await query("DELETE FROM oauth_states WHERE state = $1 RETURNING state", [state]);
  return res.rowCount === 1;
}

async function tokenRequest(body: URLSearchParams) {
  if (!transConfigured()) {
    throw new Error("Trans.eu client_id, client_secret and api-key are not configured.");
  }
  await tokenLimiter.take();
  const res = await fetch(config.trans.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Api-key": config.trans.apiKey,
    },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      (json.error_description as string) || (json.error as string) || `Token error ${res.status}`
    );
  }
  return json as {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope?: string;
  };
}

export async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.trans.redirectUri,
    client_id: config.trans.clientId,
    client_secret: config.trans.clientSecret,
  });
  const token = await tokenRequest(body);
  await persistToken(token);
  return token;
}

export async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.trans.clientId,
    client_secret: config.trans.clientSecret,
  });
  const token = await tokenRequest(body);
  await persistToken(token);
  return token;
}

async function persistToken(token: {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}) {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  await query(
    `INSERT INTO oauth_tokens (access_token, refresh_token, token_type, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [token.access_token, token.refresh_token, token.token_type, token.scope || null, expiresAt]
  );
}

export async function getValidAccessToken() {
  const res = await query<{
    access_token: string;
    refresh_token: string | null;
    expires_at: Date | null;
  }>(
    `SELECT access_token, refresh_token, expires_at
     FROM oauth_tokens
     ORDER BY created_at DESC
     LIMIT 1`
  );
  const row = res.rows[0];
  if (!row) return null;
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (exp && exp - Date.now() > 60_000) return row.access_token;
  if (!row.refresh_token) return row.access_token;
  const refreshed = await refreshAccessToken(row.refresh_token);
  return refreshed.access_token;
}

export async function connectionStatus() {
  const res = await query<{ expires_at: Date | null; scope: string | null; created_at: Date }>(
    `SELECT expires_at, scope, created_at FROM oauth_tokens ORDER BY created_at DESC LIMIT 1`
  );
  const row = res.rows[0];
  return {
    configured: transConfigured(),
    connected: Boolean(row),
    expiresAt: row?.expires_at || null,
    scope: row?.scope || null,
    connectedAt: row?.created_at || null,
    rateLimits: {
      tokenRps: 5,
      apiRps: 15,
    },
    notes: [
      "Each Trans.eu user must authorize separately (OAuth authorization_code).",
      "Authorization codes expire in 60 seconds.",
      "Always persist the latest refresh_token.",
      "Carriers can negotiate via API only on direct, partner, and fixed-route offers — exchange offers stay on the Trans.eu platform.",
    ],
  };
}
