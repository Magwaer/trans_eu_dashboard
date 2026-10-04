import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { authRouter } from "./routes/auth.js";
import { apiRouter } from "./routes/api.js";
import { webhookRouter } from "./routes/webhooks.js";
import { startScheduler } from "./workers/scheduler.js";

const app = express();
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "trans-eu-ops" });
});

app.use("/api/auth", authRouter);
app.use("/api/webhooks", webhookRouter);
app.use("/api", apiRouter);

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

async function main() {
  await pool.query("SELECT 1");
  startScheduler();
  app.listen(config.port, () => {
    console.log(`Trans.eu ops listening on ${config.appUrl}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
