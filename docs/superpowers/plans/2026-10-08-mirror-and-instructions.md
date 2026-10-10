# Instruction File, Client Setup & Markdown Mirror Implementation Plan (Plan 5 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop — ship the portable instruction file that makes any AI actually consult the library over MCP, a per-client connect sheet, and a scheduled Markdown mirror of the whole library into a private git repo for backup/portability.

**Architecture:** Two independent halves. (1) **Docs**: a provider-agnostic Markdown instruction file + a client setup guide (no code). (2) **Mirror**: a new `scheduled()` handler on the existing Worker renders every entry (with relations/resources/links/media) to Markdown and commits changed files to a private GitHub repo via the Contents API, driven by a Cloudflare Cron Trigger. It is a no-op until `MIRROR_REPO` is configured.

**Tech Stack:** Cloudflare Workers + Hono, D1, Cron Triggers, GitHub REST Contents API, Vitest + `@cloudflare/vitest-pool-workers` (mocked `fetch`).

**Spec:** `docs/superpowers/specs/2026-10-08-personal-knowledge-hub-design.md` (§9 instruction file, §5 mirror/Cron, §8 MCP)

## Global Constraints

- Workers only; runtime deps `hono` + `postal-mime` (no new deps).
- The mirror must never throw out of `scheduled()` — errors are logged and swallowed so a failed run never looks like a crash.
- Mirror config: `MIRROR_REPO` (e.g. `owner/repo`) and optional `MIRROR_BRANCH` (default `main`) as plain vars; `GITHUB_MIRROR_TOKEN` as a secret. If `MIRROR_REPO` is empty/unset, `runMirror` is a no-op.
- Secrets are never logged or returned.
- All SQL parameterized; the mirror only reads.
- Timestamps ISO-8601 UTC.

## Review Focus

Input classes most likely to break a real mirror/doc, each pinned to a test in its owning task:

1. **Unicode/emoji in titles or bodies** — the GitHub API takes base64, which must be UTF-8-safe (not `btoa` on raw chars). (Task 3)
2. **Entry ids/titles that collide or produce empty slugs** — mirror filenames must stay unique and non-empty. (Task 2)
3. **Unconfigured mirror** (`MIRROR_REPO` empty) — `scheduled()` must no-op cleanly, never call GitHub. (Task 4)
4. **Append-only context (relations/links/media)** — an entry with all three must render every section; an entry with none must render cleanly. (Task 2)
5. **Unchanged entry on a later run** — the mirror must skip rewriting identical content (no empty commits). (Task 3)

## File Structure

- `src/mirror/render.ts` — `renderEntryMarkdown`, `renderIndex`, `mirrorPath`.
- `src/mirror/github.ts` — GitHub Contents API client (`getFile`, `putFile`), UTF-8-safe base64.
- `src/mirror/run.ts` — `runMirror(db, config)`: size-checked, change-detecting.
- `src/index.ts` — add `scheduled()` to the default export.
- `wrangler.jsonc` — `triggers.crons` + `MIRROR_REPO`/`MIRROR_BRANCH` vars.
- `agent/how-i-bortey.md` — the portable instruction file.
- `docs/MCP-CLIENT-SETUP.md` — per-client connect guide.
- Tests: `test/mirror-render.test.ts`, `test/mirror-run.test.ts`.

---

### Task 1: Wire the scheduled handler + config (no-op by default)

**Files:**
- Modify: `src/index.ts`, `wrangler.jsonc`
- Create: `src/mirror/run.ts` (stub), `test/mirror-run.test.ts`

**Interfaces:**
- Consumes: `env.DB`, `env.MIRROR_REPO`, `env.MIRROR_BRANCH`, `env.GITHUB_MIRROR_TOKEN`.
- Produces: `runMirror(db, config: { repo: string; branch: string; token: string }): Promise<{ written: number; skipped: number; configured: boolean }>` — for this task it returns `{ written: 0, skipped: 0, configured: false }` immediately (real body in Task 3); Worker default export gains a `scheduled()` handler that calls it inside `waitUntil` and swallows errors.

- [ ] **Step 1: Write the failing test `test/mirror-run.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { runMirror } from "../src/mirror/run";

describe("mirror: unconfigured is a no-op", () => {
  it("returns configured:false and does not touch the network", async () => {
    const result = await runMirror(env.DB, { repo: "", branch: "main", token: "" });
    expect(result).toEqual({ written: 0, skipped: 0, configured: false });
  });
});

describe("scheduled handler", () => {
  it("is exported and runs without throwing when unconfigured", async () => {
    // The Worker default export exposes a scheduled() handler.
    const worker = (await import("../src/index")).default as {
      scheduled?: (e: unknown, env2: unknown, ctx: unknown) => Promise<void>;
    };
    expect(typeof worker.scheduled).toBe("function");
    await worker.scheduled!({}, env, { waitUntil: (p: Promise<unknown>) => p });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/mirror-run.test.ts`
Expected: FAIL (module missing / no scheduled export).

- [ ] **Step 3: Create `src/mirror/run.ts` (stub)**

```ts
export interface MirrorConfig {
  repo: string;
  branch: string;
  token: string;
}

export interface MirrorResult {
  written: number;
  skipped: number;
  configured: boolean;
}

export async function runMirror(
  _db: D1Database,
  config: MirrorConfig,
): Promise<MirrorResult> {
  if (!config.repo || !config.token) {
    return { written: 0, skipped: 0, configured: false };
  }
  return { written: 0, skipped: 0, configured: true };
}
```

- [ ] **Step 4: Add the `scheduled` handler to `src/index.ts`**

Replace the default export:

```ts
import { runMirror } from "./mirror/run";

export default {
  fetch: app.fetch,
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleInboundEmail(
      { from: message.from, headers: message.headers, raw: message.raw },
      env,
    );
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runMirror(env.DB, {
        repo: env.MIRROR_REPO ?? "",
        branch: env.MIRROR_BRANCH ?? "main",
        token: env.GITHUB_MIRROR_TOKEN ?? "",
      }).catch((err) => {
        console.error("mirror failed", err);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 5: Add cron + vars to `wrangler.jsonc`**

Add:

```jsonc
  "triggers": { "crons": ["0 3 * * *"] },
```
and to `vars`:
```jsonc
    "MIRROR_REPO": "",
    "MIRROR_BRANCH": "main"
```

Then run `npx wrangler types` to regenerate `worker-configuration.d.ts`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- test/mirror-run.test.ts`
Expected: PASS (2/2).

- [ ] **Step 7: Full suite + type-check + commit**

```bash
npm test && npx tsc --noEmit
git add src/index.ts src/mirror/run.ts wrangler.jsonc worker-configuration.d.ts test/mirror-run.test.ts
git commit -m "feat: add scheduled mirror handler (no-op until configured)"
```

---

### Task 2: Entry → Markdown rendering

**Files:**
- Create: `src/mirror/render.ts`
- Test: `test/mirror-render.test.ts`

**Interfaces:**
- Consumes: `Entry` (`src/db/types.ts`), `Link` (`src/db/links.ts`), `Relation` (`src/db/relations.ts`), `Media` (`src/media/store.ts`).
- Produces:
  - `MirrorEntry = Entry & { links: Link[]; relations: Relation[]; media: Media[] }`
  - `mirrorPath(entry: MirrorEntry): string` → `entries/<slug>-<id8>.md`
  - `renderEntryMarkdown(entry: MirrorEntry): string`
  - `renderIndex(entries: MirrorEntry[]): string`

- [ ] **Step 1: Write the failing test `test/mirror-render.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mirrorPath, renderEntryMarkdown, renderIndex } from "../src/mirror/render";
import type { MirrorEntry } from "../src/mirror/render";

function entry(over: Partial<MirrorEntry> = {}): MirrorEntry {
  return {
    id: "31be2146-0000-0000-0000-000000000000",
    title: "Capture One",
    kind: "tool",
    status: "filed",
    verdict: "use",
    body: "Preferred for raw editing.",
    source: "telegram",
    source_url: null,
    attributes: { my_rating: 5 },
    created_at: "2026-10-10T08:12:01.000Z",
    updated_at: "2026-10-10T08:12:01.000Z",
    tags: ["photography", "raw"],
    links: [],
    relations: [],
    media: [],
    ...over,
  };
}

describe("mirrorPath", () => {
  it("slugs the title and appends an id suffix", () => {
    expect(mirrorPath(entry())).toBe("entries/capture-one-31be2146.md");
  });
  it("falls back to a non-empty slug", () => {
    expect(mirrorPath(entry({ title: "💥" }))).toMatch(/^entries\/entry-31be2146\.md$/);
  });
});

describe("renderEntryMarkdown", () => {
  it("renders frontmatter, body, and every non-empty section", () => {
    const md = renderEntryMarkdown(
      entry({
        links: [{ id: "l1", url: "https://darktable.org", title: "Manual", kind: "docs", note: null }],
        relations: [{ id: "r1", type: "alternative_of", verdict: "rejected", reason: "subscription", related: { id: "x", title: "Lightroom", kind: "tool", status: "filed", verdict: null } }],
      }),
    );
    expect(md).toContain('title: "Capture One"');
    expect(md).toContain("tags: [\"photography\", \"raw\"]");
    expect(md).toContain("# Capture One");
    expect(md).toContain("Preferred for raw editing.");
    expect(md).toContain("## Alternatives");
    expect(md).toContain("Lightroom — alternative_of (rejected): subscription");
    expect(md).toContain("## Links");
    expect(md).toContain("[Manual](https://darktable.org)");
  });

  it("renders cleanly for an entry with no relations, links or media", () => {
    const md = renderEntryMarkdown(entry());
    expect(md).not.toContain("## Alternatives");
    expect(md).not.toContain("## Links");
    expect(md).not.toContain("## Media");
  });

  it("survives emoji in the body", () => {
    expect(renderEntryMarkdown(entry({ body: "raw ✨ editor" }))).toContain("raw ✨ editor");
  });
});

describe("renderIndex", () => {
  it("lists entries with a link to each file", () => {
    const idx = renderIndex([entry()]);
    expect(idx).toContain("# How I Bortey — Library");
    expect(idx).toContain("- [Capture One](entries/capture-one-31be2146.md)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/mirror-render.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/mirror/render.ts`**

```ts
import type { Entry } from "../db/types";
import type { Link } from "../db/links";
import type { Relation } from "../db/relations";
import type { Media } from "../media/store";

export interface MirrorEntry extends Entry {
  links: Link[];
  relations: Relation[];
  media: Media[];
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "entry"
  );
}

export function mirrorPath(entry: MirrorEntry): string {
  return `entries/${slugify(entry.title)}-${entry.id.slice(0, 8)}.md`;
}

export function renderEntryMarkdown(e: MirrorEntry): string {
  const front = [
    "---",
    `id: ${e.id}`,
    `title: ${JSON.stringify(e.title)}`,
    `kind: ${e.kind}`,
    `status: ${e.status}`,
    e.verdict ? `verdict: ${e.verdict}` : null,
    `source: ${e.source}`,
    e.source_url ? `source_url: ${e.source_url}` : null,
    `tags: [${e.tags.map((t) => JSON.stringify(t)).join(", ")}]`,
    `attributes: ${JSON.stringify(e.attributes)}`,
    `created_at: ${e.created_at}`,
    `updated_at: ${e.updated_at}`,
    "---",
  ].filter((l): l is string => l !== null);

  const out = [front.join("\n"), "", `# ${e.title}`, ""];
  if (e.body.trim()) out.push(e.body.trim(), "");

  if (e.relations.length) {
    out.push("## Alternatives", "");
    for (const r of e.relations) {
      const verdict = r.verdict ? ` (${r.verdict})` : "";
      const reason = r.reason ? `: ${r.reason}` : "";
      out.push(`- ${r.related?.title ?? "(missing)"} — ${r.type}${verdict}${reason}`);
    }
    out.push("");
  }
  if (e.links.length) {
    out.push("## Links", "");
    for (const l of e.links) out.push(`- [${l.title ?? l.url}](${l.url})`);
    out.push("");
  }
  if (e.media.length) {
    out.push("## Media", "");
    for (const m of e.media) out.push(`- /media/${m.id} (${m.mime ?? "unknown"})`);
    out.push("");
  }
  return out.join("\n");
}

export function renderIndex(entries: MirrorEntry[]): string {
  const sorted = [...entries].sort((a, b) => (a.title < b.title ? -1 : 1));
  const lines = ["# How I Bortey — Library", "", `${entries.length} entries.`, ""];
  for (const e of sorted) {
    lines.push(`- [${e.title}](${mirrorPath(e)})`);
  }
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/mirror-render.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Full suite + type-check + commit**

```bash
npm test && npx tsc --noEmit
git add src/mirror/render.ts test/mirror-render.test.ts
git commit -m "feat: render library entries to Markdown for the mirror"
```

---

### Task 3: GitHub mirror run (change-detecting)

**Files:**
- Create: `src/mirror/github.ts`
- Modify: `src/mirror/run.ts`
- Test: `test/mirror-run.test.ts` (extend)

**Interfaces:**
- Consumes: `mirrorPath`/`renderEntryMarkdown`/`renderIndex` (Task 2), `getEntry`/`listEntries` (Plan 1), `getRelations`/`getLinks`/`getMediaForEntry`.
- Produces:
  - `src/mirror/github.ts`: `utf8ToBase64(s: string): string`, `githubGetFile(cfg, path): Promise<{ sha: string; content: string } | null>`, `githubPutFile(cfg, path, content, message): Promise<void>`.
  - `runMirror(db, config)` now writes changed entry files + `index.md`, returning `{ written, skipped, configured }`.

- [ ] **Step 1: Extend `test/mirror-run.test.ts`**

Add (keep the existing unconfigured test):

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { runMirror } from "../src/mirror/run";
import { createEntry } from "../src/db/entries";

const cfg = { repo: "owner/library", branch: "main", token: "ghp_test" };

describe("mirror run", () => {
  beforeEach(() => {
    resetDb();
    vi.restoreAllMocks();
  });

  it("writes an entry file and an index on the first run", async () => {
    await createEntry(env.DB, { title: "Capture One", body: "raw editor ✨" });
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u}`);
      if ((init?.method ?? "GET") === "GET") return new Response("", { status: 404 });
      return new Response(JSON.stringify({ content: {} }), { status: 200 });
    });

    const result = await runMirror(env.DB, cfg);
    expect(result.configured).toBe(true);
    expect(result.written).toBeGreaterThanOrEqual(2); // entry + index
    expect(calls.some((c) => c.startsWith("PUT") && c.includes("contents/entries/"))).toBe(true);
    expect(calls.some((c) => c.startsWith("PUT") && c.includes("contents/index.md"))).toBe(true);
  });

  it("skips unchanged files on a second run", async () => {
    await createEntry(env.DB, { title: "Capture One" });
    const store = new Map<string, string>();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = String(url);
      const path = decodeURIComponent(u.split("/contents/")[1]?.split("?")[0] ?? "");
      const method = init?.method ?? "GET";
      if (method === "GET") {
        const content = store.get(path);
        if (!content) return new Response("", { status: 404 });
        return new Response(JSON.stringify({ sha: "s", content: Buffer.from(content).toString("base64") }), { status: 200 });
      }
      const body = JSON.parse(String(init!.body));
      store.set(path, Buffer.from(body.content, "base64").toString());
      return new Response(JSON.stringify({ content: {} }), { status: 200 });
    });

    const first = await runMirror(env.DB, cfg);
    const second = await runMirror(env.DB, cfg);
    expect(first.written).toBeGreaterThan(0);
    expect(second.written).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/mirror-run.test.ts`
Expected: FAIL (still the stub; no writes).

- [ ] **Step 3: Implement `src/mirror/github.ts`**

```ts
export interface GithubConfig {
  repo: string;
  branch: string;
  token: string;
}

function api(cfg: GithubConfig, path: string): string {
  return `https://api.github.com/repos/${cfg.repo}/contents/${path}`;
}

function headers(cfg: GithubConfig): Record<string, string> {
  return {
    authorization: `Bearer ${cfg.token}`,
    accept: "application/vnd.github+json",
    "user-agent": "how-i-bortey-mirror",
  };
}

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function githubGetFile(
  cfg: GithubConfig,
  path: string,
): Promise<{ sha: string; content: string } | null> {
  const res = await fetch(`${api(cfg, path)}?ref=${cfg.branch}`, { headers: headers(cfg) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`github get ${path}: ${res.status}`);
  const data = (await res.json()) as { sha: string; content: string };
  const content = new TextDecoder().decode(
    Uint8Array.from(atob(data.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)),
  );
  return { sha: data.sha, content };
}

export async function githubPutFile(
  cfg: GithubConfig,
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<void> {
  const res = await fetch(api(cfg, path), {
    method: "PUT",
    headers: { ...headers(cfg), "content-type": "application/json" },
    body: JSON.stringify({
      message,
      content: utf8ToBase64(content),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`github put ${path}: ${res.status}`);
}
```

- [ ] **Step 4: Replace `src/mirror/run.ts`**

```ts
import { getEntry, listEntries } from "../db/entries";
import { getLinks } from "../db/links";
import { getRelations } from "../db/relations";
import { getMediaForEntry } from "../media/store";
import { githubGetFile, githubPutFile } from "./github";
import { mirrorPath, renderEntryMarkdown, renderIndex, type MirrorEntry } from "./render";

export interface MirrorConfig {
  repo: string;
  branch: string;
  token: string;
}

export interface MirrorResult {
  written: number;
  skipped: number;
  configured: boolean;
}

async function buildEntry(db: D1Database, id: string): Promise<MirrorEntry | null> {
  const entry = await getEntry(db, id);
  if (!entry) return null;
  return {
    ...entry,
    links: await getLinks(db, id),
    relations: await getRelations(db, id),
    media: await getMediaForEntry(db, id),
  };
}

export async function runMirror(
  db: D1Database,
  config: MirrorConfig,
): Promise<MirrorResult> {
  if (!config.repo || !config.token) {
    return { written: 0, skipped: 0, configured: false };
  }

  const cfg = { repo: config.repo, branch: config.branch, token: config.token };
  const listed = await listEntries(db, { limit: 200 });
  const entries: MirrorEntry[] = [];
  for (const e of listed) {
    const full = await buildEntry(db, e.id);
    if (full) entries.push(full);
  }

  let written = 0;
  let skipped = 0;

  const files: Array<[string, string]> = entries.map((e) => [
    mirrorPath(e),
    renderEntryMarkdown(e),
  ]);
  files.push(["index.md", renderIndex(entries)]);

  for (const [path, content] of files) {
    const existing = await githubGetFile(cfg, path);
    if (existing && existing.content === content) {
      skipped += 1;
      continue;
    }
    await githubPutFile(cfg, path, content, `mirror: ${path}`, existing?.sha);
    written += 1;
  }

  return { written, skipped, configured: true };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- test/mirror-run.test.ts`
Expected: PASS (4/4).

- [ ] **Step 6: Full suite + type-check + commit**

```bash
npm test && npx tsc --noEmit
git add src/mirror/github.ts src/mirror/run.ts test/mirror-run.test.ts
git commit -m "feat: mirror library to a private git repo on a schedule"
```

---

### Task 4: The portable instruction file

**Files:**
- Create: `agent/how-i-bortey.md`

- [ ] **Step 1: Write `agent/how-i-bortey.md`**

It must be usable as an opencode/Claude skill, an `AGENTS.md`/`CLAUDE.md` snippet, or ChatGPT custom instructions. Content:

```markdown
---
name: how-i-bortey
description: Use before answering how-to, tool-selection, or "what should I use for X" questions — consult the owner's personal library of tools, choices and workflows and lead with what they already chose.
---

# How I Bortey

You have access to the owner's personal knowledge library over MCP (tools: `search_library`, `get_entry`, `add_entry`, `list_tags`).

## Before answering

Before you answer any how-to, tool-selection, or "which should I use" question, call
`search_library` with a short `query` describing the task (e.g. "editing a photo",
"raw photo editor", "invoice tool"). Include `tags` or `kind` if you can.

## If the library has a match

Lead with the owner's own answer:

1. Name the **tool/choice they landed on**, and say that it's their recorded preference.
2. Give **why they chose it** and any **gotchas** (from the entry's attributes/body).
3. List the **alternatives they rated**, with the verdict (chosen/considered/rejected/watching) and reason.
4. Link their **tutorials/docs** (call `get_entry` to get `links`).
5. Only then add your own suggestion, clearly marked as yours.

Do not present a generic recommendation ahead of the owner's recorded choice.

## If there is no match

Say so, answer normally, then **offer to save** the result:

> "Want me to save this to your library?" → call `add_entry` with a concise title, the tool/choice, tags, and any links.

## If the request is ambiguous

Ask which task or tool they mean before searching, so the query is specific.

## Never

- Never invent library entries or claim a preference the library doesn't record.
- Never expose raw HTML/JSON; translate entries into plain language.
```

- [ ] **Step 2: Commit**

```bash
git add agent/how-i-bortey.md
git commit -m "docs: portable instruction file for any AI client"
```

---

### Task 5: Per-client MCP connect sheet

**Files:**
- Create: `docs/MCP-CLIENT-SETUP.md`

- [ ] **Step 1: Write `docs/MCP-CLIENT-SETUP.md`**

Cover, with copy-paste blocks:
1. **Mint a token** — in the app, Access → Create (copy the shown-once token). It's your bearer.
2. **Endpoint** — `https://howibortey.switgh.com/mcp` (remote HTTP).
3. **Custom instructions** — paste `agent/how-i-bortey.md` into the client's system prompt / custom instructions.
4. **Claude / Claude Desktop** — add a remote MCP server with the URL and `Authorization: Bearer <token>` header.
5. **ChatGPT / connectors** — add a custom connector pointing at the same URL + bearer.
6. **Cursor / VS Code (Copilot)** — `.cursor/mcp.json` / `.vscode/mcp.json` snippet with `"url"` + headers.
7. **Gemini CLI** — `settings.json` MCP server entry.
8. **stdio-only clients** — the `mcp-remote` bridge:
   ```json
   { "mcpServers": { "how-i-bortey": { "command": "npx", "args": ["-y", "mcp-remote", "https://howibortey.switgh.com/mcp", "--header", "Authorization: Bearer <token>"] } } }
   ```
9. **Verify** — ask the client: *"Search my library for photo editors."* A correct setup returns your captured entries.
10. **Revoke** — Access → Log out everywhere, or mint a fresh 12h token.

- [ ] **Step 2: Commit**

```bash
git add docs/MCP-CLIENT-SETUP.md
git commit -m "docs: per-client MCP connect sheet"
```

---

## Plan Self-Review

**Spec coverage:** §9 instruction file ✅ (Task 4); §8 MCP tools referenced by the instruction ✅; §5 scheduled Markdown mirror to a private repo ✅ (Tasks 1–3); §13 secrets/bindings — `MIRROR_REPO`/`MIRROR_BRANCH`/`GITHUB_MIRROR_TOKEN` ✅ (Task 1). Per-client setup (a Plan-2 execution note) ✅ (Task 5).

**Placeholder scan:** no TBD/TODO. Task 1's `runMirror` is an explicit stub completed in Task 3 (stated).

**Type consistency:** `MirrorEntry`, `mirrorPath`, `renderEntryMarkdown`, `renderIndex`, `GithubConfig`, `MirrorConfig`, `MirrorResult` named consistently across Tasks 1–3; `runMirror` return shape stable.

**Review Focus:** all five pinned — UTF-8 base64 (Task 3 test uses `✨` + emoji body; `utf8ToBase64`), slug fallback (Task 2), unconfigured no-op (Task 1 + 3), all-sections/empty-sections rendering (Task 2), unchanged-skip (Task 3 second run).

## Execution Note

Tasks 1→2→3 are sequential (each builds on the last); Tasks 4–5 are independent docs. Recommend **subagent-driven** for 1–3 and direct authoring for 4–5.

## Manual steps (see `docs/MANUAL-STEPS.md`)
- Create the **private** mirror repo (e.g. `how-i-bortey-library`).
- Create a **fine-grained PAT** (Contents: read & write) scoped to it.
- Set `MIRROR_REPO` (var, e.g. `dbortey/how-i-bortey-library`) and `GITHUB_MIRROR_TOKEN` (secret).
