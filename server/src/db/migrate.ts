import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const reset = process.argv.includes("--reset");
const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");

async function migrate() {
  const client = await pool.connect();
  try {
    if (reset) {
      await client.query(`
        DROP TABLE IF EXISTS
          training_samples, webhook_events, sync_runs, ai_runs,
          automation_actions, notes, orders, negotiation_events,
          negotiations, freights, feeds, oauth_states, oauth_tokens, settings
        CASCADE;
      `);
    }
    const sql = fs.readFileSync(schemaPath, "utf8");
    await client.query(sql);
    console.log(reset ? "Database reset and migrated." : "Database migrated.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
