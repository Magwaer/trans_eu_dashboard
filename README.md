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

## Production on trans.tnlcrm.com

App lives at `/home/trans` on the server. Nginx terminates TLS and proxies to Node on `127.0.0.1:4000`. Public URL: https://trans.tnlcrm.com/

### 1. Server packages

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Need Node.js 20+ and Docker (for Postgres). Install PM2 globally: `sudo npm i -g pm2`.

Point DNS for `trans.tnlcrm.com` at this server before requesting a certificate.

### 2. App on /home/trans

```bash
cd /home/trans
cp .env.example .env
```

Production `.env` (change secrets):

```bash
PORT=4000
APP_URL=https://trans.tnlcrm.com
CLIENT_URL=https://trans.tnlcrm.com
SESSION_SECRET=replace-with-a-long-random-string
DASHBOARD_PASSWORD=replace-me
DATABASE_URL=postgres://transeu:transeu@localhost:5433/transeu
TRANS_CLIENT_ID=
TRANS_CLIENT_SECRET=
TRANS_API_KEY=
TRANS_REDIRECT_URI=https://trans.tnlcrm.com/api/auth/trans/callback
TRANS_CALLBACK_URL=https://trans.tnlcrm.com/api/webhooks/trans
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514
SYNC_INTERVAL_SECONDS=90
AUTOMATION_ENABLED=true
SEED_DEMO_DATA=false
```

Register the same redirect URI in the Trans.eu app. Allow Trans.eu callback IP `52.208.90.151` to reach `POST /api/webhooks/trans`.

```bash
cd /home/trans
npm ci
npm run db:up
npm run db:migrate
npm run build
```

`npm run build` compiles the API to `server/dist` and the UI to `client/dist`. Express serves both.

### 3. Run with PM2

Config: `ecosystem.config.cjs`. One forked process (do not use cluster — the scheduler must run once).

```bash
sudo npm i -g pm2
cd /home/trans
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

`pm2 startup` prints a `sudo` command — run that so the process comes back after reboot, then `pm2 save` again if asked.

```bash
pm2 status
pm2 logs lane-desk
curl -s http://127.0.0.1:4000/api/health
```

After later deploys:

```bash
cd /home/trans
git pull
npm ci
npm run build
pm2 restart lane-desk
```

Or: `npm run pm2:start` / `npm run pm2:restart` / `npm run pm2:logs`.

### 4. Nginx

This server keeps every vhost in `/etc/nginx/nginx.conf` (`include /etc/nginx/conf.d/*.conf` is commented out; `sites-enabled` is not used). A file under `sites-available` will never load.

Paste the two `server` blocks from `deploy/nginx/trans.tnlcrm.com.conf` into the `http { }` section, next to `v2.tnlcrm.com` and `lead.tnlcrm.com`. Without a `server_name trans.tnlcrm.com` block, nginx uses the first `:443` site (`v2.tnlcrm.com`).

```bash
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS uses the existing `tnlcrm.com` certificate at `/etc/letsencrypt/live/tnlcrm.com/` (same as v2/lead). HTTP redirects to HTTPS; `/` is proxied to `127.0.0.1:4000`.

### 5. Certbot (Let's Encrypt)

No extra cert is needed if `*.tnlcrm.com` is already covered by `/etc/letsencrypt/live/tnlcrm.com/`. Renewals stay on the existing certbot timer:

```bash
sudo certbot renew --dry-run
sudo systemctl status certbot.timer
```

If that name is not on the cert, add it and reload:

```bash
sudo certbot certonly --nginx -d tnlcrm.com -d v2.tnlcrm.com -d lead.tnlcrm.com -d trans.tnlcrm.com
sudo systemctl reload nginx
```

Site: https://trans.tnlcrm.com/
