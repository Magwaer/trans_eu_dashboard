import type { CookieOptions, NextFunction, Request, Response } from "express";
import { config } from "../config.js";

export const deskCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.appUrl.startsWith("https"),
  path: "/",
  maxAge: 14 * 86400000,
};

export function isDeskUnlocked(req: Request) {
  return req.cookies?.desk_session === config.sessionSecret;
}

export function requireDesk(req: Request, res: Response, next: NextFunction) {
  if (isDeskUnlocked(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "Dashboard locked" });
}
