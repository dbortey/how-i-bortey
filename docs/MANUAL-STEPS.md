# Manual steps — things only you can do

Living checklist. I can't click dashboards, use BotFather, or receive your secrets. I update this as we go. ✅ = done, ⬜ = you still need to do it. "I can" = tell me and I'll run it.

## Account & tools
- ✅ Cloudflare account created; `wrangler` authenticated on this machine.
- ✅ D1 `how-i-bortey-db`, KV `SESSIONS`, R2 `how-i-bortey-media` created.
- ✅ Repo `github.com/dbortey/how-i-bortey` connected; `main` pushes work.
- ⬜ (optional) Uninstall the Render CLI — we didn't use Render.

## Domain
- ✅ `switgh.com` added to Cloudflare; nameservers changed at Hostinger and active.
- ✅ `howibortey.switgh.com` attached to the Worker (via `wrangler.jsonc` `routes` + deploy). Live: `https://howibortey.switgh.com/health` → `{"ok":true}`.

## First production deploy
- ✅ Deployed the Worker (`npm run deploy`). Version `e77bf31c`; bindings present (DB, MEDIA, SESSIONS, EMAIL, ASSETS). Remote migrations applied (0001, 0002).

## Magic-link email (Cloudflare Email Service — no key needed)
- ✅ Email Routing enabled on `switgh.com` (MX `route1/2/3.mx.cloudflare.net` live).
- ✅ Destination inbox verified; production sending confirmed — `POST /auth/request` returned `{"ok":true}` (EMAIL binding delivered).
- ⬜ (optional) `npx wrangler secret delete RESEND_API_KEY` — no longer used.
- Note: a sign-in link was emailed to you on deploy day; nothing is captured until you (or later, an MCP client) act on it.

## Telegram (Plan 4)
Status as of last check: **Worker secrets empty** (`wrangler secret list` → `[]`) and **no webhook registered** (`getWebhookInfo` → `"url":""`). Do these in order:
- ⬜ **Rotate the token** (a token was shared in plaintext): @BotFather → `/mybots` → your bot → API Token → **Revoke**, copy the new token.
- ⬜ `npx wrangler secret put TELEGRAM_BOT_TOKEN` (paste the new token)
- ⬜ `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET` (type any long random string — you'll reuse it next)
- ⬜ Register the webhook (replace `<TOKEN>` and `<SECRET>`; same secret as above):
  ```
  curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://howibortey.switgh.com/telegram/webhook" -d "secret_token=<SECRET>"
  ```
  Expect `{"ok":true,...,"description":"Webhook was set"}`.
- ⬜ Message your bot; I'll re-check the DB.

## Email-to-capture (Plan 4)
- ⬜ (verify) Send a test email to `capture@switgh.com` and confirm the routing rule action is **Send to a Worker → how-i-bortey**. As of last check **0 email entries** had landed.

## Media serving (R2, Plan 4)
- ✅ Decided: served by the **Worker route** `GET /media/:id` (session-protected, same-origin). No dashboard step, no public bucket needed. Already live.

## Plan 5 (mirror + instruction file)
- ⬜ Create a **private** repo for the Markdown mirror (e.g. `how-i-bortey-library`).
- ⬜ Create a GitHub **fine-grained PAT** (Contents: read & write) scoped to that repo → `npx wrangler secret put GITHUB_MIRROR_TOKEN`.
- ⬜ Tell me the mirror repo name so I can wire the Cron export.
