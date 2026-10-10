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
- ⬜ Enable Email Routing: dashboard → zone **switgh.com** → **Email → Email Routing → Enable** (adds MX/TXT records).
- ⬜ Add your destination inbox (`mrdbortey@gmail.com`) and click the verification email Cloudflare sends. *(Sending to your verified destination is free on any plan.)* **Until this is done, production sign-in will return "email not configured" — the `EMAIL` binding can't deliver yet.**
- ⬜ (optional) `npx wrangler secret delete RESEND_API_KEY` — no longer used.

## Telegram (Plan 4)
- ⬜ Message **@BotFather** → `/newbot` → copy the **bot token**.
- ⬜ Set the two secrets (run yourself):
  - `npx wrangler secret put TELEGRAM_BOT_TOKEN`
  - `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET` (make up any random string)
- ⬜ Register the webhook (the endpoint is already deployed). Run this with your token and chosen secret filled in:
  ```
  curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" ^
    -d "url=https://howibortey.switgh.com/telegram/webhook" ^
    -d "secret_token=<YOUR_WEBHOOK_SECRET>"
  ```
  (In Git Bash/POSIX, use `\` line continuations and single quotes.) Expect `{"ok":true,...,"pending_update_count":0}`.

## Email-to-capture (Plan 4)
- ⬜ After enabling Email Routing, add a routing rule that sends mail for a capture address (e.g. `capture@switgh.com`) **to the Worker** — dashboard: Email → Email Routing → Routes → edit the catch-all/custom rule → action **Send to a Worker → how-i-bortey**.

## Media serving (R2, Plan 4)
- ✅ Decided: served by the **Worker route** `GET /media/:id` (session-protected, same-origin). No dashboard step, no public bucket needed. Already live.

## Plan 5 (mirror + instruction file)
- ⬜ Create a **private** repo for the Markdown mirror (e.g. `how-i-bortey-library`).
- ⬜ Create a GitHub **fine-grained PAT** (Contents: read & write) scoped to that repo → `npx wrangler secret put GITHUB_MIRROR_TOKEN`.
- ⬜ Tell me the mirror repo name so I can wire the Cron export.
