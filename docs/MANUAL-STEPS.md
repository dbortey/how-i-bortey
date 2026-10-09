# Manual steps — things only you can do

Living checklist. I can't click dashboards, use BotFather, or receive your secrets. I update this as we go. ✅ = done, ⬜ = you still need to do it. "I can" = tell me and I'll run it.

## Account & tools
- ✅ Cloudflare account created; `wrangler` authenticated on this machine.
- ✅ D1 `how-i-bortey-db`, KV `SESSIONS`, R2 `how-i-bortey-media` created.
- ✅ Repo `github.com/dbortey/how-i-bortey` connected; `main` pushes work.
- ⬜ (optional) Uninstall the Render CLI — we didn't use Render.

## Domain
- ✅ `switgh.com` added to Cloudflare; nameservers changed at Hostinger and active.
- ⬜ Attach `howibortey.switgh.com` to the Worker — dashboard: **Workers & Pages → how-i-bortey → Settings → Domains & Routes → Add → Custom domain → `howibortey.switgh.com`**. (I can do it with `wrangler` after the first deploy — tell me.)

## First production deploy
- ⬜ Deploy the Worker: run **`npm run deploy`** (builds the web UI, then deploys). *I can run this for you if you say so — it's a production side-effect, so I won't without a go-ahead.*

## Magic-link email (Cloudflare Email Service — no key needed)
- ⬜ Enable Email Routing: dashboard → zone **switgh.com** → **Email → Email Routing → Enable** (adds MX/TXT records).
- ⬜ Add your destination inbox (`mrdbortey@gmail.com`) and click the verification email Cloudflare sends. *(Sending to your verified destination is free on any plan.)*
- ⬜ (optional) `npx wrangler secret delete RESEND_API_KEY` — no longer used.

## Telegram (Plan 4)
- ⬜ Message **@BotFather** → `/newbot` → copy the **bot token**.
- ⬜ Set the two secrets (run yourself):
  - `npx wrangler secret put TELEGRAM_BOT_TOKEN`
  - `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET` (make up any random string)
- ⬜ Register the webhook (after deploy) — I'll print the exact `curl` once the endpoint exists; you paste your token into it. (Or run `wrangler secret list` to confirm they're set.)

## Email-to-capture (Plan 4)
- ⬜ After enabling Email Routing, add a routing rule that sends mail for a capture address (e.g. `capture@switgh.com`) **to the Worker** — dashboard: Email → Email Routing → Routes → edit the catch-all/custom rule → action **Send to a Worker → how-i-bortey**.

## Media serving (R2, Plan 4)
- ⬜ Decide how images are served (I'll recommend in Plan 4): a Worker route (no dashboard step, I can do it) **or** a public R2 domain (dashboard → R2 → `how-i-bortey-media` → Settings → Public access → enable `r2.dev` or a custom domain).

## Plan 5 (mirror + instruction file)
- ⬜ Create a **private** repo for the Markdown mirror (e.g. `how-i-bortey-library`).
- ⬜ Create a GitHub **fine-grained PAT** (Contents: read & write) scoped to that repo → `npx wrangler secret put GITHUB_MIRROR_TOKEN`.
- ⬜ Tell me the mirror repo name so I can wire the Cron export.
