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
- ✅ Bot token + webhook secret set on the Worker; webhook registered; **verified end-to-end** — a text message created an `inbox` entry (`source: telegram`) and the bot replied "Saved: …".
- ⬜ (optional) Send the bot a **photo** to exercise the R2 media path (media count is still 0).
- ⬜ (recommended) Since an earlier token was shared in plaintext, consider rotating it in @BotFather and re-running: `wrangler secret put TELEGRAM_BOT_TOKEN` + `setWebhook` with the same secret.

## Email-to-capture (Plan 4)
- ✅ Verified end-to-end — an email to `capture@switgh.com` created an `inbox` entry (`source: email`).
- (Optional) Add other custom addresses in Email Routing (e.g. `help@` → forward to your Gmail); routing rules are per-address and independent of capture.

## Media serving (R2, Plan 4)
- ✅ Decided: served by the **Worker route** `GET /media/:id` (session-protected, same-origin). No dashboard step, no public bucket needed. Already live.

## Plan 5 (mirror + instruction file)
- ⬜ Create a **private** repo for the Markdown mirror (e.g. `how-i-bortey-library`).
- ⬜ Create a GitHub **fine-grained PAT** (Contents: read & write) scoped to that repo → `npx wrangler secret put GITHUB_MIRROR_TOKEN`.
- ⬜ Tell me the mirror repo name so I can wire the Cron export.
