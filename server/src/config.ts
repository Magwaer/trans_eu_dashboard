import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });

export const config = {
  port: Number(process.env.PORT || 4000),
  appUrl: process.env.APP_URL || "http://localhost:4000",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  dashboardPassword: process.env.DASHBOARD_PASSWORD || "ops",
  databaseUrl:
    process.env.DATABASE_URL || "postgres://transeu:transeu@localhost:5432/transeu",
  trans: {
    clientId: process.env.TRANS_CLIENT_ID || "",
    clientSecret: process.env.TRANS_CLIENT_SECRET || "",
    apiKey: process.env.TRANS_API_KEY || "",
    redirectUri:
      process.env.TRANS_REDIRECT_URI || "http://localhost:4000/api/auth/trans/callback",
    authUrl: process.env.TRANS_AUTH_URL || "https://auth.platform.trans.eu/oauth2/auth",
    tokenUrl:
      process.env.TRANS_TOKEN_URL ||
      "https://api.platform.trans.eu/ext/auth-api/accounts/token",
    apiBase: process.env.TRANS_API_BASE || "https://api.platform.trans.eu",
    exchangeBase: process.env.TRANS_EXCHANGE_BASE || "https://api-platform.trans.eu",
    callbackUrl: process.env.TRANS_CALLBACK_URL || "",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
  },
  syncIntervalSeconds: Number(process.env.SYNC_INTERVAL_SECONDS || 90),
  automationEnabled: process.env.AUTOMATION_ENABLED !== "false",
  seedDemoData: process.env.SEED_DEMO_DATA !== "false",
};

export function transConfigured() {
  return Boolean(config.trans.clientId && config.trans.clientSecret && config.trans.apiKey);
}

export function anthropicConfigured() {
  return Boolean(config.anthropic.apiKey);
}
