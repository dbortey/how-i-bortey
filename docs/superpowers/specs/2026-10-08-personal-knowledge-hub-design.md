# How I Bortey — Personal Knowledge Hub (Design Spec)

**Date:** 2026-10-08
**Status:** Approved design, pending spec review
**Repo:** https://github.com/dbortey/how-i-bortey

## 1. Purpose

A single, always-available library of the tools, choices and ways of working the
owner has already figured out — so that any AI assistant the owner talks to can
remind them of a better option they have already found, why they chose it, what
alternatives they rated, and where their own tutorials/docs live.

Canonical example: the owner opens a photo to edit, reaches for Lightroom, and
forgets that they trialled Capture One, preferred it, and have notes, ratings
and tutorials on it. This hub surfaces that memory inside whatever AI they are
using, anywhere, on any machine.

## 2. Goals

- **Portable.** The same knowledge is usable from any AI provider or editor that
  supports MCP, with a web fallback for those that do not.
- **Low capture friction.** Add knowledge from PC (web) or phone (Telegram),
  including links and images, without leaving what you are doing.
- **Accurate retrieval.** Given a fuzzy task ("I'm editing a photo"), surface the
  relevant entry, the owner's chosen tool, the reasoning, and rated
  alternatives — not a wall of everything.
- **Private and revocable.** Online, single-user, with a kill switch that cuts
  every previously connected machine off on demand.
- **Upgradeable.** Starts focused on tool/choice memory and can grow to
  workflows, decisions and general notes without a schema rewrite.
- **Free at personal scale.** Runs entirely within Cloudflare's free tiers.

## 3. Non-goals (v1)

- Semantic/vector search (schema is prepared for it via Vectorize, but v1 is
  tags + full-text).
- Folder-drop sync from the local filesystem.
- Link scraping / content archiving / link-rot snapshots.
- Multi-user, sharing, or team features.
- Offline mode or a native mobile app.
- Automatic *proactive* retrieval inside the AI (v1 is AI-initiated tool calls
  guided by the portable instruction file).

## 4. Decisions already made

| Area | Decision |
| --- | --- |
| Users | Single user |
| Platform | Cloudflare throughout (Workers, D1, R2, KV, Vectorize, Cron) |
| Runtime | Cloudflare Workers (Hono) for API + `/mcp` + Telegram webhook |
| Database | Cloudflare D1 (SQLite) |
| Web UI | Vite + React + Tailwind + shadcn/ui (static assets) |
| Access model | Remote MCP over HTTP + web fallback; bearer-token auth |
| Logout guarantee | Kill switch: revoke on demand; short-lived MCP tokens |
| Audience scope | Tool/choice memory now, room to grow |
| Retrieval | SQLite FTS5 now; Cloudflare Vectorize later |
| Capture (v1) | Web + Telegram; folder-sync and link archiving later |
| Media | Cloudflare R2 |
| Sessions/tokens | D1 `sessions` table |
| Mirror | Cloudflare Cron Trigger → private git repo |

## 5. Architecture

```
                         ┌────────────── Cloudflare ──────────────┐
                         │                                        │
  Owner ──browser──▶  Static UI ──┐                               │
                    (Vite/React)  │                               │
                                  ▼                               │
  Telegram ─webhook────────▶  Worker (Hono)  ──▶ D1 (SQLite)      │
                                  │   │   │                       │
                          ┌───────┘   │   └───────┐               │
                          ▼           ▼           ▼               │
                   MCP (/mcp)      R2 (media)   KV/D1 (sessions)  │
                          ▲                       │               │
                          │                       ▼               │
                   AI clients            Cron → git mirror        │
                   (Claude, GPT,         Vectorize (later)        │
                    Cursor, ...)                                  │
                         └────────────────────────────────────────┘
```

**Components**

1. **Static web UI** (Vite + React + Tailwind + shadcn/ui), served as Cloudflare
   static assets. Log in; browse, search, edit, capture; manage alternatives;
   manage access (view connected devices/tokens, "Log out everywhere").
2. **Worker API** (Hono) — single source of backend truth. Serves the UI, the
   MCP endpoint, and the Telegram webhook.
3. **MCP endpoint** (`/mcp`, remote HTTP transport). Bearer-token auth tied to
   the owner account. Tools (see §8).
4. **Telegram bot** (webhook → Worker route). Text, links and photos become
   entries tagged `inbox` for later tidying on the web.
5. **D1 (SQLite)** — source of truth. See §6.
6. **R2** — images only.
7. **KV / D1 sessions** — active tokens and device list.
8. **Cron Trigger** — scheduled Markdown mirror to a private git repo.
9. **Vectorize** (later) — semantic search when needed.

**Data flow**

- *Capture:* web or Telegram → Worker → D1 (status `inbox` or `filed`).
- *Retrieval:* AI reads the portable instruction file → calls `search_library`
  → Worker verifies token → FTS5 search → entries, ratings of alternatives,
  and links.
- *Kill switch:* "Log out everywhere" deletes `sessions` rows → every MCP call
  fails instantly; a machine must re-authenticate from the site.

**Platform constraints to respect**

- **D1 is SQLite.** No `tsvector`/`pgvector`; use FTS5 for search and Vectorize
  for semantics later. JSON fields are TEXT using SQLite JSON functions. UUIDs
  are generated in the Worker.
- **D1 write throughput** is modest; batch writes and keep per-request writes
  small. Reads scale better than writes.
- **Workers CPU limits** (free tier: 10ms CPU/request soft; keep handlers lean,
  do heavy work in queues/cron if it ever grows).
- **Telegram webhook must ack fast.** Always return 200 quickly; dedupe by
  `update_id`; do heavier work after ack.
- **Cloudflare free tiers:** Workers ~100k req/day; D1 ~5GB and ~5M row-reads /
  100k row-writes per day; R2 10GB with no egress fees. Ample for personal use.

## 6. Data model

Single flexible core: everything is an **entry**; relationships between entries
encode "I chose X over Y." All timestamps ISO-8601 TEXT; all ids UUID TEXT.

**entries**
- `id` TEXT PK, `title` TEXT
- `kind` (`tool` | `workflow` | `decision` | `note`)
- `status` (`inbox` | `filed` | `archived`)
- `verdict` (`use` | `avoid` | `watching`)
- `body` TEXT (markdown)
- `source` (`web` | `telegram`), `source_url` TEXT NULL
- `attributes` TEXT (JSON) — kind-specific fields, e.g. for `tool`:
  `pricing_model` (`subscription` | `one-time` | `freemium` | `open-source`),
  `platforms` (win/mac/linux/web/ios/android), `my_rating` (1–5),
  `website`, `why_i_chose_it`, `gotchas`
- `created_at`, `updated_at`

**entries_fts** — FTS5 virtual table (`title`, `body`, `tags`, `entry_id`
UNINDEXED), kept in sync with `entries` and `entry_tags` by triggers. Backs
`search_library`.

**entry_relations** — encodes choices without duplicating tools
- `from_entry`, `to_entry` (FK → entries)
- `type` (`alternative_of` | `supersedes` | `pairs_with`)
- `verdict` (`chosen` | `considered` | `rejected` | `watching`)
- `reason` TEXT

**tags**
- `id`, `name`, `kind` (`domain` | `task` | `platform` | `pricing`)

**entry_tags**
- `entry_id`, `tag_id`

**links**
- `id`, `entry_id`, `url`, `title`
- `kind` (`tutorial` | `docs` | `social` | `video` | `article`)
- `note` TEXT, `snapshot` TEXT NULL (reserved for link-rot archiving)

**media**
- `id`, `entry_id` NULL, `storage_key`, `mime`, `width`, `height`, `caption`

**users**
- `id`, `email`, `created_at`

**sessions** (also the MCP token store)
- `id`, `user_id`, `token_hash`, `device_label`
- `created_at`, `last_used_at`, `expires_at`, `revoked_at`

**Rationale:** tool-specific fields live in a JSON `attributes` column so kinds
can diverge later without migrations; `entry_relations` lets the same tool
appear in many comparisons without duplication and lets "editing photos"
retrieve the chosen tool, its reasoning, and its alternatives together.

## 7. Web UI

- **Stack:** Vite + React + Tailwind CSS + shadcn/ui (components copied into the
  repo). TanStack Table for the entries list; `react-hook-form` + `zod` for
  entry forms; shadcn `cmdk` command palette for search; `sonner` toasts;
  `next-themes` (or a small theme provider) for dark mode; Tiptap or a markdown
  textarea + preview for bodies.
- **Screens (v1):** Login; Library (list + filters + full-text search); Entry
  detail/edit (body, tags, links, alternatives, rating, pricing/platforms);
  Capture (quick add); Inbox (tidy Telegram captures); Access (connected
  devices/tokens + "Log out everywhere").
- Served as static assets from Cloudflare; talks to the Worker API over HTTPS.

## 8. MCP endpoint and tools

- **Transport:** remote HTTP MCP at `/mcp` (Worker route).
- **Auth:** bearer token (`sessions` row), short-lived (hours) with refresh from
  the site. Revoked/expired → 401.
- **Tools:**
  - `search_library(query, tags?, kind?)` → matching entries + related
    alternatives + links.
  - `get_entry(id)` → full entry with relations, links, media, attributes.
  - `add_entry(...)` → create an entry (defaults to `inbox`); backs the
    "want me to save this?" loop.
  - `list_tags()` → for refining queries.
- **Errors:** structured and human-readable ("no entries matched 'X'") so the AI
  can recover; never leak internals or SQL.

## 9. The portable instruction file (makes it work in any AI)

One Markdown doc, lightly frontmattered, adapted per environment: an
opencode/Claude **skill**, an `AGENTS.md`/`CLAUDE.md` snippet, ChatGPT custom
instructions / connector. Behaviour it prescribes:

1. Before answering a how-to or *which-tool* question, call `search_library`
   with the task.
2. If an entry matches, lead with the owner's chosen tool, why it was chosen,
   and the rated alternatives; link their tutorials/docs; then suggest.
3. If the request is ambiguous, ask the owner's intent.
4. Offer to save new findings via `add_entry`.

Ships with a per-client connect sheet (Claude, ChatGPT, Cursor/VS Code, Gemini
CLI) plus the `mcp-remote` bridge snippet for stdio-only clients.

## 10. Error handling

- Validate at the edge with `zod`; typed error envelope for the UI.
- Telegram webhook: always 200 fast; dedupe by `update_id`; process after ack.
- MCP: structured, human-readable errors; never expose internals.
- D1: use prepared statements, batch related writes, catch constraint
  violations; no connection-pool concerns (D1 is request-scoped).
- Media upload failure: save the entry anyway; flag media for retry; never lose
  the text.
- Kill switch: token checked on every MCP call; revoked → immediate 401.
- Mirror job: a failed GitHub commit logs/alerts but never blocks; D1 remains
  the source of truth.

## 11. Testing

- **Unit (Vitest):** tag/search normalization, FTS5 query builder,
  entry↔relation mapping, token hashing + expiry.
- **Worker integration (`@cloudflare/vitest-pool-workers`):** routes against a
  local D1 — capture → store → search round trip; auth and revocation.
- **E2E (Playwright):** log in, create an entry, search finds it, kill switch
  revokes a simulated token.
- **MCP contract tests:** valid vs expired token against `/mcp`.
- **Telegram:** fixture payloads through the webhook handler.

## 12. Auth

- **Recommended:** magic-link email implemented directly in the Worker
  (send via Resend, store a one-time token in D1, verify on click). Keeps the
  stack uniform and avoids pulling a heavy auth framework onto Workers.
- **Alternative:** passphrase + signed session cookie.
- Both back onto the `users` + `sessions` tables so the kill switch is uniform.

## 13. Hosting, bindings & secrets

- **Cloudflare Worker** `how-i-bortey` — API + `/mcp` + Telegram webhook + Cron.
- **Bindings:** `DB` (D1), `MEDIA` (R2), `SESSIONS` (KV, optional), `VECTORIZE`
  (later).
- **Static UI** — Cloudflare Pages/Workers static assets.
- **Secrets (`wrangler secret put`):** `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_WEBHOOK_SECRET`, `RESEND_API_KEY`, `AUTH_SECRET`,
  `GITHUB_MIRROR_TOKEN`.
- **Config:** `wrangler.toml`/`wrangler.jsonc` for bindings and Cron schedule.
- **Cost:** free at personal scale across all Cloudflare products.

## 14. Open questions (resolve during implementation)

1. Mirror target: `/library` folder in this repo vs a separate private repo.
   Default: separate private repo.
2. Which AI clients the owner uses day-to-day, to prioritise the connect sheet.
3. Whether the UI ships as Cloudflare Pages or as Worker static assets.
   Default: Worker static assets (one deploy).

## 15. Next step

Once this spec is reviewed and approved, invoke `writing-plans` to produce the
implementation plan. No product code before the plan exists.
