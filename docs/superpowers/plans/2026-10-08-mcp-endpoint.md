# MCP Endpoint & Tools Implementation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the How I Bortey library to any MCP-capable AI over a remote HTTP endpoint at `/mcp`, authenticated by short-lived bearer tokens that the existing kill switch can revoke.

**Architecture:** A stateless JSON-RPC 2.0 handler on the existing Hono Worker implements the subset of the MCP Streamable HTTP transport needed for tools: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`. Bearer tokens are `sessions` rows (already built in Plan 1) so `POST /access/revoke-all` disables every client instantly. Four tools wrap the Plan 1 repository: `search_library`, `get_entry`, `add_entry`, `list_tags`.

**Tech Stack:** Cloudflare Workers, Hono, TypeScript, D1, Vitest + `@cloudflare/vitest-pool-workers`. No new runtime dependencies — the MCP handler is hand-rolled JSON-RPC 2.0 so it runs anywhere and is trivially testable.

**Spec:** `docs/superpowers/specs/2026-10-08-personal-knowledge-hub-design.md` (§8 MCP endpoint, §9 instruction file, §10 error handling)

## Global Constraints

- Platform: Cloudflare Workers only; no Node-only APIs.
- Runtime deps: `hono` only (no MCP SDK — the protocol subset is hand-rolled).
- Protocol: JSON-RPC 2.0. Respond `202` with no body to any `notifications/*` method.
- Auth: `Authorization: Bearer <token>` resolved through `getActiveSession`; missing/expired/revoked → HTTP `401` with a JSON-RPC error body and a `WWW-Authenticate: Bearer` header.
- Token values are only ever returned once, at creation; stored only as SHA-256 hashes (Plan 1).
- All SQL parameterized; never interpolate user input.
- Tool errors are delivered inside the JSON-RPC `result` as `{ content: [...], isError: true }`, never as a protocol error, so the AI can read and recover.
- IDs/timestamps: `crypto.randomUUID()` and ISO-8601 UTC strings.

## Review Focus

Inputs/conditions most likely to bite a real MCP client, each pinned to a test in its owning task:

1. **Unknown/newer `protocolVersion` in `initialize`** — must still initialize (echo the requested version, else default `2025-06-18`), never error. (Task 3)
2. **Expired or revoked bearer token** — must return HTTP 401, not 500 and not a 200 JSON-RPC error. (Task 3)
3. **`tools/call` with an unknown tool name, or missing/`null` `arguments`** — must return a readable `isError` result, never crash. (Tasks 4, 5)
4. **Malformed JSON request body** — must return `-32700` with HTTP 400, not a 500. (Task 3)
5. **`search_library` with FTS syntax characters** (`OR`, `"`, `*`) — must not throw through the tool. (Task 4)

## File Structure

- `src/db/relations.ts` — read `entry_relations` joined to the related entry.
- `src/db/links.ts` — read a entry's links.
- `src/db/tags.ts` — list tags with usage counts.
- `src/db/types.ts` — extend `EntrySource` with `"mcp"`.
- `src/mcp/auth.ts` — resolve a bearer token to a session.
- `src/mcp/protocol.ts` — JSON-RPC types + response helpers.
- `src/mcp/tools.ts` — tool definitions + `callTool` dispatch.
- `src/mcp/routes.ts` — the `/mcp` Hono router.
- `src/routes/access.ts` — add `POST /access/tokens` (mint a short-lived token).
- `src/index.ts` — mount `/mcp`.
- Tests: `test/library-reads.test.ts`, `test/tokens.test.ts`, `test/mcp.test.ts`.

---

### Task 1: Library read helpers (relations, links, tags)

**Files:**
- Create: `src/db/relations.ts`, `src/db/links.ts`, `src/db/tags.ts`
- Modify: `src/db/types.ts`
- Test: `test/library-reads.test.ts`

**Interfaces:**
- Consumes: `env.DB`, the `entry_relations`, `links`, `tags`, `entry_tags` tables (Plan 1).
- Produces:
  - `getRelations(db: D1Database, entryId: string): Promise<Relation[]>` where `Relation = { id: string; type: string; verdict: string | null; reason: string | null; related: RelatedEntry | null }` and `RelatedEntry = { id: string; title: string; kind: string; status: string; verdict: string | null }`.
  - `getLinks(db: D1Database, entryId: string): Promise<Link[]>` where `Link = { id: string; url: string; title: string | null; kind: string | null; note: string | null }`.
  - `listTags(db: D1Database): Promise<TagCount[]>` where `TagCount = { name: string; kind: string; count: number }`.
  - `EntrySource` now includes `"mcp"`.

- [ ] **Step 1: Extend `EntrySource` in `src/db/types.ts`**

```ts
export type EntrySource = "web" | "telegram" | "mcp";
```

- [ ] **Step 2: Write the failing test `test/library-reads.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "./reset";
import { createEntry } from "../src/db/entries";
import { getRelations } from "../src/db/relations";
import { getLinks } from "../src/db/links";
import { listTags } from "../src/db/tags";

beforeEach(resetDb);

describe("library read helpers", () => {
  it("returns relations pointing at the related entry", async () => {
    const winner = await createEntry(env.DB, { title: "Capture One", kind: "tool" });
    const loser = await createEntry(env.DB, { title: "Lightroom", kind: "tool" });
    await env.DB
      .prepare(
        "INSERT INTO entry_relations (id, from_entry, to_entry, type, verdict, reason) VALUES (?, ?, ?, 'alternative_of', 'rejected', 'subscription only')",
      )
      .bind(crypto.randomUUID(), winner.id, loser.id)
      .run();

    const relations = await getRelations(env.DB, winner.id);
    expect(relations).toHaveLength(1);
    expect(relations[0].verdict).toBe("rejected");
    expect(relations[0].related?.title).toBe("Lightroom");
  });

  it("returns links for an entry", async () => {
    const e = await createEntry(env.DB, { title: "Darktable" });
    await env.DB
      .prepare("INSERT INTO links (id, entry_id, url, title, kind) VALUES (?, ?, ?, ?, 'tutorial')")
      .bind(crypto.randomUUID(), e.id, "https://example.com/t", "Getting started")
      .run();

    const links = await getLinks(env.DB, e.id);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://example.com/t");
    expect(links[0].kind).toBe("tutorial");
  });

  it("lists tags with usage counts", async () => {
    await createEntry(env.DB, { title: "A", tags: ["photo"] });
    await createEntry(env.DB, { title: "B", tags: ["photo", "oss"] });
    const tags = await listTags(env.DB);
    const photo = tags.find((t) => t.name === "photo");
    const oss = tags.find((t) => t.name === "oss");
    expect(photo?.count).toBe(2);
    expect(oss?.count).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- test/library-reads.test.ts`
Expected: FAIL with "Cannot find module '../src/db/relations'".

- [ ] **Step 4: Implement `src/db/relations.ts`**

```ts
export interface RelatedEntry {
  id: string;
  title: string;
  kind: string;
  status: string;
  verdict: string | null;
}

export interface Relation {
  id: string;
  type: string;
  verdict: string | null;
  reason: string | null;
  related: RelatedEntry | null;
}

interface RelationRow {
  id: string;
  type: string;
  verdict: string | null;
  reason: string | null;
  rid: string | null;
  rtitle: string | null;
  rkind: string | null;
  rstatus: string | null;
  rverdict: string | null;
}

export async function getRelations(
  db: D1Database,
  entryId: string,
): Promise<Relation[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id AS id, r.type AS type, r.verdict AS verdict, r.reason AS reason,
              e.id AS rid, e.title AS rtitle, e.kind AS rkind, e.status AS rstatus, e.verdict AS rverdict
       FROM entry_relations r
       LEFT JOIN entries e ON e.id = r.to_entry
       WHERE r.from_entry = ?
       ORDER BY r.type, r.id`,
    )
    .bind(entryId)
    .all<RelationRow>();
  return results.map((r) => ({
    id: r.id,
    type: r.type,
    verdict: r.verdict,
    reason: r.reason,
    related: r.rid
      ? { id: r.rid, title: r.rtitle ?? "", kind: r.rkind ?? "", status: r.rstatus ?? "", verdict: r.rverdict }
      : null,
  }));
}
```

- [ ] **Step 5: Implement `src/db/links.ts`**

```ts
export interface Link {
  id: string;
  url: string;
  title: string | null;
  kind: string | null;
  note: string | null;
}

export async function getLinks(db: D1Database, entryId: string): Promise<Link[]> {
  const { results } = await db
    .prepare(
      `SELECT id, url, title, kind, note FROM links
       WHERE entry_id = ? ORDER BY id`,
    )
    .bind(entryId)
    .all<Link>();
  return results;
}
```

- [ ] **Step 6: Implement `src/db/tags.ts`**

```ts
export interface TagCount {
  name: string;
  kind: string;
  count: number;
}

export async function listTags(db: D1Database): Promise<TagCount[]> {
  const { results } = await db
    .prepare(
      `SELECT t.name AS name, t.kind AS kind, COUNT(et.entry_id) AS count
       FROM tags t
       LEFT JOIN entry_tags et ON et.tag_id = t.id
       GROUP BY t.id
       ORDER BY count DESC, t.name ASC`,
    )
    .all<TagCount>();
  return results;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- test/library-reads.test.ts`
Expected: PASS (3/3).

- [ ] **Step 8: Run the full suite and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, 0 type errors.

- [ ] **Step 9: Commit**

```bash
git add src/db/types.ts src/db/relations.ts src/db/links.ts src/db/tags.ts test/library-reads.test.ts
git commit -m "feat: add relations, links and tags read helpers"
```

---

### Task 2: MCP token minting + bearer resolution

**Files:**
- Modify: `src/routes/access.ts`
- Create: `src/mcp/auth.ts`
- Test: `test/tokens.test.ts`

**Interfaces:**
- Consumes: `createSession(db, userId, deviceLabel, ttlHours?)` and `getActiveSession(db, token)` (Plan 1); `requireSession` middleware + `AppEnv`.
- Produces:
  - `POST /access/tokens` `{ label?, ttlHours? }` → `201 { token, id, expiresAt }` (token shown once). `ttlHours` clamped to 1..168, default 12.
  - `resolveBearer(db: D1Database, request: Request): Promise<{ userId: string; sessionId: string } | null>`.

- [ ] **Step 1: Write the failing test `test/tokens.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession, getActiveSession } from "../src/auth/sessions";
import { resolveBearer } from "../src/mcp/auth";

beforeEach(resetDb);

async function ownerCookie(): Promise<string> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "web");
  return `hib_session=${token}`;
}

describe("mcp tokens", () => {
  it("requires a session to mint a token", async () => {
    const res = await SELF.fetch("https://example.com/access/tokens", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("mints a token that resolves to a live session", async () => {
    const cookie = await ownerCookie();
    const res = await SELF.fetch("https://example.com/access/tokens", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ label: "claude", ttlHours: 2 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ token: string; id: string; expiresAt: string }>();
    expect(typeof body.token).toBe("string");

    const session = await getActiveSession(env.DB, body.token);
    expect(session?.id).toBe(body.id);
  });

  it("resolves a bearer token from a request header", async () => {
    const user = await upsertUserByEmail(env.DB, "owner@example.com");
    const { token, id } = await createSession(env.DB, user.id, "cli", 2);
    const request = new Request("https://example.com/mcp", {
      headers: { authorization: `Bearer ${token}` },
    });
    const resolved = await resolveBearer(env.DB, request);
    expect(resolved?.sessionId).toBe(id);
    expect(resolved?.userId).toBe(user.id);
  });

  it("returns null for a missing or garbage bearer token", async () => {
    expect(await resolveBearer(env.DB, new Request("https://example.com/mcp"))).toBeNull();
    const bad = new Request("https://example.com/mcp", { headers: { authorization: "Bearer nope" } });
    expect(await resolveBearer(env.DB, bad)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/tokens.test.ts`
Expected: FAIL ("Cannot find module '../src/mcp/auth'" and 404 for `/access/tokens`).

- [ ] **Step 3: Add `POST /tokens` to `src/routes/access.ts`**

Add `createSession` to the existing import from `../auth/sessions`, then add this route below the existing routes:

```ts
accessRoutes.post("/tokens", async (c) => {
  const body = await c.req
    .json<{ label?: string; ttlHours?: number }>()
    .catch(() => ({} as { label?: string; ttlHours?: number }));
  const ttl = Math.min(Math.max(Math.floor(body.ttlHours ?? 12), 1), 168);
  const label =
    typeof body.label === "string" && body.label.trim() ? body.label.trim() : "mcp client";
  const created = await createSession(c.env.DB, c.get("userId"), label, ttl);
  return c.json({ token: created.token, id: created.id, expiresAt: created.expiresAt }, 201);
});
```

- [ ] **Step 4: Implement `src/mcp/auth.ts`**

```ts
import { getActiveSession } from "../auth/sessions";

export async function resolveBearer(
  db: D1Database,
  request: Request,
): Promise<{ userId: string; sessionId: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const session = await getActiveSession(db, match[1].trim());
  if (!session) return null;
  return { userId: session.userId, sessionId: session.id };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- test/tokens.test.ts`
Expected: PASS (4/4).

- [ ] **Step 6: Full suite + type-check**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, 0 type errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/access.ts src/mcp/auth.ts test/tokens.test.ts
git commit -m "feat: add MCP token minting and bearer resolution"
```

---

### Task 3: MCP JSON-RPC core (initialize, ping, tools/list) + `/mcp`

**Files:**
- Create: `src/mcp/protocol.ts`, `src/mcp/routes.ts`
- Modify: `src/index.ts`
- Test: `test/mcp.test.ts`

**Interfaces:**
- Consumes: `resolveBearer` (Task 2), `TOOLS` from `src/mcp/tools.ts` (created here as definitions only; `callTool` is added in Task 4 — for this task, `tools/call` may return a placeholder `isError` result, replaced in Task 4).
- Produces:
  - `src/mcp/protocol.ts`: `JsonRpcError` type, `rpcError(id, code, message)`, `RPC_PARSE_ERROR = -32700`, `RPC_INVALID_PARAMS = -32602`, `RPC_METHOD_NOT_FOUND = -32601`, `RPC_UNAUTHORIZED = -32001`, `DEFAULT_PROTOCOL = "2025-06-18"`.
  - `src/mcp/tools.ts`: `ToolDefinition` type and `TOOLS: ToolDefinition[]` (names: `search_library`, `get_entry`, `add_entry`, `list_tags`).
  - `src/mcp/routes.ts`: `mcpRoutes: Hono<{ Bindings: Env }>` mounted at `/mcp`.

- [ ] **Step 1: Write the failing test `test/mcp.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession, revokeSession } from "../src/auth/sessions";

beforeEach(resetDb);

async function newToken(): Promise<{ token: string; id: string; userId: string }> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token, id } = await createSession(env.DB, user.id, "mcp", 2);
  return { token, id, userId: user.id };
}

async function rpc(token: string | null, payload: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return SELF.fetch("https://example.com/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

describe("mcp transport", () => {
  it("rejects requests without a token", async () => {
    const res = await rpc(null, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("rejects a revoked token", async () => {
    const { token, id } = await newToken();
    await revokeSession(env.DB, id);
    const res = await rpc(token, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.status).toBe(401);
  });

  it("initializes, echoing the client's protocol version", async () => {
    const { token } = await newToken();
    const res = await rpc(token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ result: { protocolVersion: string; capabilities: { tools: unknown }; serverInfo: { name: string } } }>();
    expect(body.result.protocolVersion).toBe("2024-11-05");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.serverInfo.name).toBe("how-i-bortey");
  });

  it("defaults the protocol version when none is requested", async () => {
    const { token } = await newToken();
    const res = await rpc(token, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    const body = await res.json<{ result: { protocolVersion: string } }>();
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("acknowledges notifications with 202 and no body", async () => {
    const { token } = await newToken();
    const res = await rpc(token, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
  });

  it("lists the four tools", async () => {
    const { token } = await newToken();
    const res = await rpc(token, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const body = await res.json<{ result: { tools: Array<{ name: string }> } }>();
    expect(body.result.tools.map((t) => t.name).sort()).toEqual([
      "add_entry",
      "get_entry",
      "list_tags",
      "search_library",
    ]);
  });

  it("returns -32601 for an unknown method", async () => {
    const { token } = await newToken();
    const res = await rpc(token, { jsonrpc: "2.0", id: 3, method: "does/notexist" });
    const body = await res.json<{ error: { code: number } }>();
    expect(body.error.code).toBe(-32601);
  });

  it("returns -32700 with 400 for malformed JSON", async () => {
    const { token } = await newToken();
    const res = await SELF.fetch("https://example.com/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: number } }>();
    expect(body.error.code).toBe(-32700);
  });

  it("rejects GET with 405", async () => {
    const res = await SELF.fetch("https://example.com/mcp");
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/mcp.test.ts`
Expected: FAIL (404s / module not found).

- [ ] **Step 3: Implement `src/mcp/protocol.ts`**

```ts
export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_UNAUTHORIZED = -32001;

export const DEFAULT_PROTOCOL = "2025-06-18";

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

export function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
): JsonRpcError {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
```

- [ ] **Step 4: Implement `src/mcp/tools.ts` with definitions only (dispatch added in Task 4)**

```ts
import type { EntryKind } from "../db/types";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolContent {
  type: "text";
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

export const KINDS: EntryKind[] = ["tool", "workflow", "decision", "note"];

export function text(data: unknown): ToolResult {
  return {
    content: [
      { type: "text", text: typeof data === "string" ? data : JSON.stringify(data) },
    ],
  };
}

export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "search_library",
    description:
      "Search the owner's personal library of tools, choices and workflows before answering a how-to or which-tool question. Returns matching entries with the owner's ratings and related alternatives.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text task or tool, e.g. 'editing a photo'." },
        tags: { type: "array", items: { type: "string" } },
        kind: { type: "string", enum: KINDS },
        limit: { type: "number", description: "Max entries (default 10, max 50)." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_entry",
    description: "Fetch one library entry by id, including its alternatives and links.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "add_entry",
    description:
      "Save a new finding to the library (created as 'inbox' for later tidying). Offer this when the owner learns something new.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        kind: { type: "string", enum: KINDS },
        body: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        attributes: { type: "object" },
        source_url: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_tags",
    description: "List the tags in use, with counts, to refine a search.",
    inputSchema: { type: "object", properties: {} },
  },
];

export async function callTool(
  _db: D1Database,
  name: string,
  _args: Record<string, unknown>,
): Promise<ToolResult> {
  return fail(`tool not implemented: ${name}`);
}
```

- [ ] **Step 5: Implement `src/mcp/routes.ts`**

```ts
import { Hono } from "hono";
import { resolveBearer } from "./auth";
import { callTool, TOOLS } from "./tools";
import {
  DEFAULT_PROTOCOL,
  RPC_INVALID_PARAMS,
  RPC_METHOD_NOT_FOUND,
  RPC_PARSE_ERROR,
  RPC_UNAUTHORIZED,
  rpcError,
} from "./protocol";

export const mcpRoutes = new Hono<{ Bindings: Env }>();

mcpRoutes.get("/", (c) => c.body(null, 405, { Allow: "POST" }));

mcpRoutes.post("/", async (c) => {
  const auth = await resolveBearer(c.env.DB, c.req.raw);
  if (!auth) {
    c.header("WWW-Authenticate", "Bearer");
    return c.json(rpcError(null, RPC_UNAUTHORIZED, "unauthorized"), 401);
  }

  let body: { id?: unknown; method?: unknown; params?: unknown } | null = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json(rpcError(null, RPC_PARSE_ERROR, "parse error"), 400);
  }

  const id = (body?.id ?? null) as string | number | null;
  const method = typeof body?.method === "string" ? body.method : "";
  const params = (
    body?.params && typeof body.params === "object" ? body.params : {}
  ) as Record<string, unknown>;

  if (method.startsWith("notifications/")) return c.body(null, 202);

  if (method === "initialize") {
    const requested =
      typeof params.protocolVersion === "string" && params.protocolVersion
        ? params.protocolVersion
        : DEFAULT_PROTOCOL;
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: requested,
        capabilities: { tools: {} },
        serverInfo: { name: "how-i-bortey", version: "0.1.0" },
      },
    });
  }

  if (method === "ping") return c.json({ jsonrpc: "2.0", id, result: {} });

  if (method === "tools/list") {
    return c.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    if (!name) return c.json(rpcError(id, RPC_INVALID_PARAMS, "invalid params: name is required"), 200);
    const args =
      params.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, unknown>)
        : {};
    const result = await callTool(c.env.DB, name, args);
    return c.json({ jsonrpc: "2.0", id, result });
  }

  return c.json(rpcError(id, RPC_METHOD_NOT_FOUND, "method not found"), 200);
});
```

- [ ] **Step 6: Mount `/mcp` in `src/index.ts`**

Add the import:

```ts
import { mcpRoutes } from "./mcp/routes";
```

Add the route (after `app.route("/access", accessRoutes);`):

```ts
app.route("/mcp", mcpRoutes);
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- test/mcp.test.ts`
Expected: PASS (9/9).

- [ ] **Step 8: Full suite + type-check**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, 0 type errors.

- [ ] **Step 9: Commit**

```bash
git add src/mcp/protocol.ts src/mcp/tools.ts src/mcp/routes.ts src/index.ts test/mcp.test.ts
git commit -m "feat: add MCP JSON-RPC transport with initialize, ping and tools/list"
```

---

### Task 4: Tools — `search_library`, `get_entry`, `list_tags`

**Files:**
- Modify: `src/mcp/tools.ts`
- Test: `test/mcp-tools.test.ts`

**Interfaces:**
- Consumes: `searchEntries` (`src/db/search.ts`), `getEntry` (`src/db/entries.ts`), `getRelations`/`getLinks`/`listTags` (Task 1).
- Produces: `callTool` dispatches these three names, returning `text(...)` on success and `fail(...)` for missing args.

- [ ] **Step 1: Write the failing test `test/mcp-tools.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession } from "../src/auth/sessions";
import { createEntry } from "../src/db/entries";

beforeEach(resetDb);

async function token(): Promise<string> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "mcp", 2);
  return token;
}

async function callTool(t: string, name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const res = await SELF.fetch("https://example.com/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await res.json<{ result: { content: Array<{ type: string; text: string }>; isError?: boolean } }>();
  return body.result;
}

describe("mcp tools: search_library", () => {
  it("finds an entry and includes its relations", async () => {
    const winner = await createEntry(env.DB, { title: "Capture One", body: "preferred photo editor" });
    const loser = await createEntry(env.DB, { title: "Lightroom" });
    await env.DB
      .prepare("INSERT INTO entry_relations (id, from_entry, to_entry, type, verdict, reason) VALUES (?, ?, ?, 'alternative_of', 'rejected', 'subscription')")
      .bind(crypto.randomUUID(), winner.id, loser.id)
      .run();

    const result = await callTool(await token(), "search_library", { query: "photo editor" });
    const entries = JSON.parse(result.content[0].text) as Array<{ title: string; relations: Array<{ related: { title: string } }> }>;
    expect(entries.map((e) => e.title)).toContain("Capture One");
    expect(entries[0].relations[0].related.title).toBe("Lightroom");
  });

  it("does not throw on FTS syntax characters", async () => {
    await createEntry(env.DB, { title: "Lightroom", body: "adobe" });
    const result = await callTool(await token(), "search_library", { query: 'lightroom OR "x" *' });
    expect(result.isError).toBeFalsy();
  });

  it("returns a readable error when query is missing", async () => {
    const result = await callTool(await token(), "search_library", {});
    expect(result.isError).toBe(true);
  });
});

describe("mcp tools: get_entry", () => {
  it("returns an entry with links", async () => {
    const e = await createEntry(env.DB, { title: "Darktable" });
    await env.DB
      .prepare("INSERT INTO links (id, entry_id, url, title, kind) VALUES (?, ?, ?, ?, 'docs')")
      .bind(crypto.randomUUID(), e.id, "https://darktable.org", "Manual")
      .run();
    const result = await callTool(await token(), "get_entry", { id: e.id });
    const entry = JSON.parse(result.content[0].text) as { title: string; links: Array<{ url: string }> };
    expect(entry.title).toBe("Darktable");
    expect(entry.links[0].url).toBe("https://darktable.org");
  });

  it("returns a readable error for an unknown id", async () => {
    const result = await callTool(await token(), "get_entry", { id: "nope" });
    expect(result.isError).toBe(true);
  });
});

describe("mcp tools: list_tags", () => {
  it("returns tags with counts", async () => {
    await createEntry(env.DB, { title: "A", tags: ["photo"] });
    const result = await callTool(await token(), "list_tags", {});
    const tags = JSON.parse(result.content[0].text) as Array<{ name: string; count: number }>;
    expect(tags.find((t) => t.name === "photo")?.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/mcp-tools.test.ts`
Expected: FAIL — every call returns `isError: true` ("tool not implemented: ...").

- [ ] **Step 3: Implement the three handlers in `src/mcp/tools.ts`**

Add these imports at the top (keep the existing imports):

```ts
import { createEntry, getEntry } from "../db/entries";
import { searchEntries } from "../db/search";
import { getRelations } from "../db/relations";
import { getLinks } from "../db/links";
import { listTags } from "../db/tags";
```

Replace the placeholder `callTool` with:

```ts
async function searchLibrary(
  db: D1Database,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const query = typeof args.query === "string" ? args.query : "";
  if (!query.trim()) return fail("query is required");
  const kind = KINDS.includes(args.kind as EntryKind) ? (args.kind as EntryKind) : undefined;
  const tags = Array.isArray(args.tags)
    ? args.tags.filter((t): t is string => typeof t === "string")
    : undefined;
  const limit =
    typeof args.limit === "number" && args.limit > 0 ? Math.min(args.limit, 50) : 10;
  const entries = await searchEntries(db, query, { kind, tags, limit });
  const enriched = await Promise.all(
    entries.map(async (e) => ({ ...e, relations: await getRelations(db, e.id) })),
  );
  return text(enriched);
}

async function getEntryTool(
  db: D1Database,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const id = typeof args.id === "string" ? args.id : "";
  if (!id) return fail("id is required");
  const entry = await getEntry(db, id);
  if (!entry) return fail(`no entry with id ${id}`);
  return text({
    ...entry,
    relations: await getRelations(db, entry.id),
    links: await getLinks(db, entry.id),
  });
}

export async function callTool(
  db: D1Database,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    if (name === "search_library") return await searchLibrary(db, args);
    if (name === "get_entry") return await getEntryTool(db, args);
    if (name === "list_tags") return text(await listTags(db));
    return fail(`unknown tool: ${name}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "tool error");
  }
}
```

(Keep the `createEntry` import for Task 5 — if the linter flags it as unused now, it is used in Task 5; to keep this task green on its own, add the `add_entry` branch in Task 5 where `createEntry` is first used and drop the `createEntry` import from this step. Concretely: in this step import only `getEntry` from `../db/entries`; Task 5 adds `createEntry`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/mcp-tools.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Full suite + type-check**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools.ts test/mcp-tools.test.ts
git commit -m "feat: add search_library, get_entry and list_tags MCP tools"
```

---

### Task 5: Tool — `add_entry` + structured errors

**Files:**
- Modify: `src/mcp/tools.ts`
- Test: `test/mcp-add.test.ts`

**Interfaces:**
- Consumes: `createEntry` (`src/db/entries.ts`); existing `fail`/`text`.
- Produces: `callTool` handles `add_entry`, creating entries with `source: "mcp"`, `status: "inbox"` by default.

- [ ] **Step 1: Write the failing test `test/mcp-add.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession } from "../src/auth/sessions";
import { listEntries } from "../src/db/entries";

beforeEach(resetDb);

async function token(): Promise<string> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "mcp", 2);
  return token;
}

async function call(t: string, name: string, args: unknown): Promise<{ content: Array<{ text: string }>; isError?: boolean }> {
  const res = await SELF.fetch("https://example.com/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await res.json<{ result: { content: Array<{ text: string }>; isError?: boolean } }>();
  return body.result;
}

describe("mcp tool: add_entry", () => {
  it("creates an inbox entry sourced from mcp", async () => {
    const result = await call(await token(), "add_entry", {
      title: "RawTherapee",
      body: "open-source raw editor",
      tags: ["photo"],
    });
    expect(result.isError).toBeFalsy();
    const entries = (await listEntries(env.DB)).filter((e) => e.source === "mcp");
    expect(entries.map((e) => e.title)).toContain("RawTherapee");
    expect(entries[0].status).toBe("inbox");
  });

  it("returns a readable error when title is missing", async () => {
    const result = await call(await token(), "add_entry", { body: "no title" });
    expect(result.isError).toBe(true);
  });

  it("returns a readable error for an unknown tool", async () => {
    const result = await call(await token(), "nope", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("unknown tool");
  });

  it("handles null arguments without crashing", async () => {
    const res = await SELF.fetch("https://example.com/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_tags", arguments: null } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ result: { isError?: boolean } }>();
    expect(body.result.isError).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/mcp-add.test.ts`
Expected: FAIL — `add_entry` returns "unknown tool"/"tool not implemented".

- [ ] **Step 3: Implement `add_entry` in `src/mcp/tools.ts`**

Add `createEntry` to the `../db/entries` import so it reads:

```ts
import { createEntry, getEntry } from "../db/entries";
```

Add this handler above `callTool`:

```ts
async function addEntryTool(
  db: D1Database,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) return fail("title is required");
  const kind = KINDS.includes(args.kind as EntryKind) ? (args.kind as EntryKind) : undefined;
  const body = typeof args.body === "string" ? args.body : undefined;
  const tags = Array.isArray(args.tags)
    ? args.tags.filter((t): t is string => typeof t === "string")
    : undefined;
  const attributes =
    args.attributes && typeof args.attributes === "object" && !Array.isArray(args.attributes)
      ? (args.attributes as Record<string, unknown>)
      : undefined;
  const source_url = typeof args.source_url === "string" ? args.source_url : undefined;
  const entry = await createEntry(db, {
    title,
    kind,
    body,
    tags,
    attributes,
    source_url,
    source: "mcp",
  });
  return text(entry);
}
```

Add the dispatch line inside `callTool` (before the `list_tags` line or after, order does not matter):

```ts
    if (name === "add_entry") return await addEntryTool(db, args);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/mcp-add.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Full suite + type-check**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools.ts test/mcp-add.test.ts
git commit -m "feat: add add_entry MCP tool and structured tool errors"
```

---

## Plan Self-Review

**Spec coverage (§8):** remote HTTP MCP at `/mcp` ✅ (Task 3); bearer-token auth tied to the account ✅ (Task 2); short-lived tokens with refresh from the site ✅ (Task 2, `ttlHours` clamp, minted via session-protected route); revoked/expired → 401 ✅ (Task 3); tools `search_library` / `get_entry` / `add_entry` / `list_tags` ✅ (Tasks 3–5); structured human-readable errors ✅ (Tasks 4–5). §10 error handling: malformed JSON → -32700/400, unknown method → -32601, tool errors as `isError` results ✅.

**Deferred to later plans (by design):** the UI that mints and displays tokens (Plan 3 — the API endpoint exists now), `streaming`/SSE responses and `resources`/`prompts` MCP capabilities (not needed for tools), the portable instruction file and per-client connect docs (Plan 5).

**Placeholder scan:** no TBD/TODO; each code step is complete. The one intentional sequencing note is in Task 4 Step 3 (import `createEntry` only in Task 5) — this is explicit, not a placeholder.

**Type consistency:** `ToolResult`/`ToolContent`/`ToolDefinition` defined once (Task 3) and reused in Tasks 4–5; `callTool(db, name, args)` signature stable across Tasks 3–5; `getRelations`/`getLinks`/`listTags` names match Task 1. Plan 1's `listEntries` filters by `status`/`kind` only, so the `add_entry` test filters by `source` in code rather than adding a repository parameter.

**Review Focus:** all five items have tests: (1) Task 3 default-protocol test; (2) Task 3 revoked-token test; (3) Tasks 4/5 missing-args + unknown-tool + null-arguments tests; (4) Task 3 malformed-JSON test; (5) Task 4 FTS-syntax test.

## Execution Note

Tasks are sequential and share interfaces (`callTool`, `TOOLS`, helpers). Recommend **subagent-driven** execution: each task is an independent review gate, and MCP protocol correctness (version negotiation, 401 vs JSON-RPC errors) is easy to get subtly wrong — a fresh reviewer per task catches that where a single long session might not.
