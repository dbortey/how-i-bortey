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

## 3. Non-goals (v1)

- Semantic/vector search (schema is prepared for it, but v1 is tags + full-text).
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
| Hosting | Vercel (web app, API, MCP endpoint, Telegram webhook) |
| Database | Render Postgres |
| Access model | Remote MCP over HTTP + web fallback; bearer-token auth |
| Logout guarantee | Kill switch: revoke on demand; short-lived MCP tokens |
| Audience scope | Tool/choice memory now, room to grow |
| Retrieval | Tags + full-text now; `pgvector` later |
| Capture (v1) | Web + Telegram; folder-sync and link archiving later |
| UI | Next.js App Router + Tailwind + shadcn/ui |
| Media | Cloudflare R2 (with Vercel Blob as the low-friction alternative) |
| Mirror | Scheduled export of entries to a private git repo |

## 5. Architecture

```
                    ┌──────────────────────────── Vercel ────────────────────────────┐
                    │                                                                 │
  Owner ──browser──▶│  Web app (Next.js + shadcn/ui)                                  │
                    │        │                                                        │
  Telegram ─webhook▶│  API route handlers ──▶ MCP endpoint (/mcp)                     │
                    │        │                       ▲                                │
                    └────────┼───────────────────────┼────────────────────────────────┘
                             │                       │ bearer token
                             ▼                       │
                    ┌────────────────┐      ┌────────┴─────────┐
                    │ Object storage │      │  AI client(s)    │
                    │  (R2 / Blob)   │      │ (Claude, GPT,    │
                    └────────────────┘      │  Cursor, ...)    │
                             │              └──────────────────┘
                             ▼
                    ┌────────────────┐      ┌──────────────────┐
                    │ Render Postgres│◀─────│  Markdown mirror │
                    │  (source of    │      │  cron → git repo │
                    │   truth)       │      └──────────────────┘
                    └────────────────┘
```

**Components**

1. **Web app** (Next.js App Router on Vercel). Log in; browse, search, edit and
   capture entries; manage alternatives and ratings; manage access (view active
   tokens/connected devices, trigger "Log out everywhere").
2. **API layer** (Next.js route handlers). Serves the web app, the MCP endpoint
   and the Telegram webhook.
3. **MCP endpoint** (`/mcp`, remote HTTP transport). Bearer-token auth tied to
   the owner account. Tools (see §8).
4. **Telegram bot** (webhook → API route). Text, links and photos become entries
   tagged `inbox` for later tidying on the web.
5. **Postgres** (Render). Source of truth. See §6.
6. **Object storage** (Cloudflare R2, or Vercel Blob). Images only.
7. **Markdown mirror** (scheduled job). Exports entries to a private git repo.

**Data flow**

- *Capture:* web or Telegram → API → Postgres (status `inbox` or `filed`).
- *Retrieval:* AI reads the portable instruction file → calls `search_library`
  → API verifies token → Postgres full-text → returns entries, ratings of
  alternatives, and links.
- *Kill switch:* "Log out everywhere" deletes session/token rows → every MCP
  call fails instantly; a machine must re-authenticate from the site.

**Platform constraints to respect**

- **Serverless + Postgres connection limits.** Vercel functions are per-request;
  Render Postgres has a finite connection limit. Use a single pooled client
  reused across invocations, keep queries short, cap concurrency, and use
  Render's connection pooler for external connections if needed.
- **Telegram webhook must ack fast.** Always return 200 quickly; dedupe by
  `update_id`; do heavier work after ack.
- **`pgvector` later** = enable the extension on Render Postgres when needed; no
  schema change required beyond adding a column/index.
- **Render Postgres free tier is time-limited** (~30 days); treat this as a
  paid (~$7/mo) datastore.
- **stdio-only MCP clients** cannot reach a remote HTTP endpoint directly and
  need a small `mcp-remote` bridge. Most clients now support remote MCP.

## 6. Data model

Single flexible core: everything is an **entry**; relationships between entries
encode "I chose X over Y."

**entries**
- `id` (uuid), `title` (text)
- `kind` (`tool` | `workflow` | `decision` | `note`)
- `status` (`inbox` | `filed` | `archived`)
- `verdict` (`use` | `avoid` | `watching`)
- `body` (markdown text)
- `source` (`web` | `telegram`), `source_url` (text, nullable)
- `attributes` (jsonb) — kind-specific fields, e.g. for `tool`:
  `pricing_model` (`subscription` | `one-time` | `freemium` | `open-source`),
  `platforms` (win/mac/linux/web/ios/android), `my_rating` (1–5),
  `website`, `why_i_chose_it`, `gotchas`
- `search_vector` (tsvector over title + body + tag names, GIN-indexed)
- `created_at`, `updated_at`

**entry_relations** — encodes choices without duplicating tools
- `from_entry` (fk → entries), `to_entry` (fk → entries)
- `type` (`alternative_of` | `supersedes` | `pairs_with`)
- `verdict` (`chosen` | `considered` | `rejected` | `watching`)
- `reason` (text)

**tags**
- `id`, `name`, `kind` (`domain` | `task` | `platform` | `pricing`)

**entry_tags**
- `entry_id`, `tag_id`

**links**
- `id`, `entry_id`, `url`, `title`
- `kind` (`tutorial` | `docs` | `social` | `video` | `article`)
- `note` (text), `snapshot` (nullable ref — reserved for link-rot archiving)

**media**
- `id`, `entry_id` (nullable), `storage_key`, `mime`, `width`, `height`, `caption`

**users**
- `id`, `email`, `created_at`

**sessions** (also the MCP token store)
- `id`, `user_id`, `token_hash`, `device_label`
- `created_at`, `last_used_at`, `expires_at`, `revoked_at`

**Rationale:** tool-specific fields live in `attributes` jsonb so kinds can
diverge later without migrations; `entry_relations` lets the same tool appear in
many comparisons without duplication and lets "editing photos" retrieve the
chosen tool, its reasoning, and its alternatives together.

## 7. Web UI

- **Stack:** Next.js App Router + Tailwind CSS + shadcn/ui (components copied
  into the repo). TanStack Table for the entries list; `react-hook-form` + `zod`
  for entry forms; shadcn `cmdk` command palette for search; `sonner` toasts;
  `next-themes` dark mode; Tiptap (or markdown textarea + preview) for bodies.
- **Screens (v1):** Login; Library (list + filters + full-text search); Entry
  detail/edit (body, tags, links, alternatives, rating, pricing/platforms);
  Capture (quick add); Inbox (tidy Telegram captures); Access (connected
  devices/tokens + "Log out everywhere").

## 8. MCP endpoint and tools

- **Transport:** remote HTTP MCP at `/mcp`.
- **Auth:** bearer token (`session` row), short-lived (hours) with refresh from
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

- Validate at the edge with `zod`; typed error envelope for the web UI.
- Telegram webhook: always 200 fast; dedupe by `update_id`; process after ack.
- MCP: structured, human-readable errors; never expose internals.
- Postgres: cap concurrency, retry with backoff, catch constraint violations.
- Media upload failure: save the entry anyway; flag media for retry; never lose
  the text.
- Kill switch: token checked on every MCP call; revoked → immediate 401.
- Mirror job: a failed git push logs/alerts but never blocks; the DB remains the
  source of truth.

## 11. Testing

- **Unit (Vitest):** tag/search normalization, tsvector query builder,
  entry↔relation mapping, token hashing + expiry.
- **Integration:** API routes against a scratch Postgres — capture → store →
  search round trip; auth and revocation.
- **E2E (Playwright):** log in, create an entry, search finds it, kill switch
  revokes a simulated token.
- **MCP contract tests:** valid vs expired token against `/mcp`.
- **Telegram:** fixture payloads through the webhook handler.

## 12. Auth

- **Recommended:** magic-link email via Auth.js + Resend (single user, least
  code, no password to leak).
- **Alternative:** passphrase + signed session cookie.
- Both back onto the `users` + `sessions` tables so the kill switch is uniform.

## 13. Hosting & environments

- **Vercel:** web app, API, MCP, Telegram webhook, cron (mirror).
- **Render:** Postgres (and, only if needed later, a small Web Service to host
  MCP + bot with long-lived DB connections).
- **Secrets (Vercel env):** `DATABASE_URL`, auth secret, `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_WEBHOOK_SECRET`, `R2_*` (or Blob token), `MIRROR_REPO_TOKEN`.
- **Cost note:** Vercel hobby is sufficient; Render Postgres becomes ~$7/mo
  after the free window.

## 14. Open questions (resolve during implementation)

1. Media host: Cloudflare R2 (cheaper egress) vs Vercel Blob (fewer moving
   parts). Default: Vercel Blob for v1.
2. Mirror target: `/library` folder in this repo vs a separate private repo.
   Default: separate private repo.
3. Which AI clients the owner uses day-to-day, to prioritise the connect sheet.

## 15. Next step

Once this spec is reviewed and approved, invoke `writing-plans` to produce the
implementation plan. No product code before the plan exists.
