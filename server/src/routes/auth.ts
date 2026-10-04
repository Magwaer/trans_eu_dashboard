import { Router } from "express";
import { config } from "../config.js";
import { anthropicConfigured } from "../config.js";
import {
  buildAuthUrl,
  connectionStatus,
  consumeOauthState,
  createOauthState,
  exchangeCode,
} from "../services/transEuAuth.js";

export const authRouter = Router();

authRouter.get("/status", async (_req, res) => {
  const trans = await connectionStatus();
  res.json({
    dashboard: true,
    anthropic: anthropicConfigured(),
    trans,
  });
});

authRouter.post("/login", (req, res) => {
  const password = String(req.body?.password || "");
  if (password !== config.dashboardPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.cookie("desk_session", config.sessionSecret, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 14 * 86400000,
  });
  res.json({ ok: true });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("desk_session");
  res.json({ ok: true });
});

authRouter.get("/trans/start", async (_req, res) => {
  try {
    const state = await createOauthState();
    res.json({ url: buildAuthUrl(state) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

authRouter.get("/trans/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    res.redirect(`${config.clientUrl}/settings?error=${encodeURIComponent(String(error_description || error))}`);
    return;
  }
  if (!code || !state || !(await consumeOauthState(String(state)))) {
    res.redirect(`${config.clientUrl}/settings?error=invalid_oauth_state`);
    return;
  }
  try {
    await exchangeCode(String(code));
    res.redirect(`${config.clientUrl}/settings?connected=1`);
  } catch (err) {
    res.redirect(
      `${config.clientUrl}/settings?error=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`
    );
  }
});
