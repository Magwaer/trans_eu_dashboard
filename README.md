# Lane Desk — Trans.eu ops dashboard

Node.js + PostgreSQL desk for watching Trans.eu freight feeds, applying pricing/negotiation rules, keeping orders and manual inputs in one place, and using Anthropic for counters, copy, and calculations.

## What it does

- **OAuth 2.0 Authorization Code** against `auth.platform.trans.eu` / `api.platform.trans.eu` (client_id, client_secret, Api-key). Each Trans.eu user must log in themselves. Codes expire in 60 seconds; the latest refresh token is stored.
- **Watch feeds** — origin/destination, bodies, weight, distance, date window, plus pricing policy (EUR/km, floor, auto-accept, strategy, suggest vs execute).
- **Inbox** of “For me” proposals and own publications, matched to feeds, with suggested prices.
- **Negotiations, orders, notes, costs, decisions** on one screen.
- **Automation** — match → price → queue or send `PATCH /freights/offers/{id}/negotiate` (and accept/reject). Respects Trans.eu rate limits: **5 rps tokens, 15 rps other**.
- **Callbacks** at `POST /api/webhooks/trans` (Trans.eu source IP `52.208.90.151`).
- **Anthropic** for price, reply drafts, and desk analysis. Falls back to local heuristics without a key.
- **Historic pull** from archived/accepted freights, proposals, and orders into JSONL training samples.

### API limits you should know

Carriers can negotiate **via API only on direct, partner, and fixed-route offers**. Public exchange offers still need the Trans.eu UI; the desk still watches, prices, and drafts the message.

Callbacks fire for objects created through the API.

## Run

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:4000
- Postgres: localhost:5433 (avoids clashing with other local stacks on 5432)
- Demo data loads so the desk is usable before OAuth.

Set `TRANS_CLIENT_ID`, `TRANS_CLIENT_SECRET`, `TRANS_API_KEY`, and `ANTHROPIC_API_KEY`. Redirect URI must match the registered app: `http://localhost:4000/api/auth/trans/callback`.
