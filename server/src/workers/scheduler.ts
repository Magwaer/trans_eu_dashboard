import cron from "node-cron";
import { config } from "../config.js";
import { syncLive } from "../services/sync.js";

export function startScheduler() {
  const seconds = Math.max(60, config.syncIntervalSeconds);
  const expr = `*/${Math.min(59, Math.round(seconds / 60) || 1)} * * * *`;
  cron.schedule(expr, async () => {
    try {
      const result = await syncLive();
      const failed = result.filter((r) => r.status === "error");
      if (failed.length) console.warn("Sync issues", failed);
    } catch (err) {
      console.error("Scheduled sync failed", err);
    }
  });
  console.log(`Live sync scheduled every ~${seconds}s (${expr}).`);
}
