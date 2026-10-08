import type {
  CreateEntryInput,
  Entry,
  EntryKind,
  EntrySource,
  EntryStatus,
  EntryVerdict,
  UpdateEntryInput,
} from "./types";

interface EntryRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  verdict: string | null;
  body: string;
  source: string;
  source_url: string | null;
  attributes: string;
  created_at: string;
  updated_at: string;
}

function parseAttributes(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function loadTags(db: D1Database, entryId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT t.name AS name FROM entry_tags et
       JOIN tags t ON t.id = et.tag_id
       WHERE et.entry_id = ? ORDER BY t.name`,
    )
    .bind(entryId)
    .all<{ name: string }>();
  return results.map((r) => r.name);
}

function toEntry(row: EntryRow, tags: string[]): Entry {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as EntryKind,
    status: row.status as EntryStatus,
    verdict: (row.verdict as EntryVerdict | null) ?? null,
    body: row.body,
    source: row.source as EntrySource,
    source_url: row.source_url,
    attributes: parseAttributes(row.attributes),
    created_at: row.created_at,
    updated_at: row.updated_at,
    tags,
  };
}

async function replaceTags(
  db: D1Database,
  entryId: string,
  tags: string[],
): Promise<string[]> {
  const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].sort();
  const stmts: D1PreparedStatement[] = [
    db.prepare("DELETE FROM entry_tags WHERE entry_id = ?").bind(entryId),
  ];
  for (const name of unique) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO tags (id, name, kind) VALUES (?, ?, 'domain')")
        .bind(crypto.randomUUID(), name),
    );
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO entry_tags (entry_id, tag_id)
           SELECT ?, id FROM tags WHERE name = ? AND kind = 'domain'`,
        )
        .bind(entryId, name),
    );
  }
  await db.batch(stmts);
  return loadTags(db, entryId);
}

async function refreshFts(db: D1Database, entryId: string): Promise<void> {
  const row = await db
    .prepare("SELECT title, body FROM entries WHERE id = ?")
    .bind(entryId)
    .first<{ title: string; body: string }>();
  const tags = await loadTags(db, entryId);
  await db.batch([
    db.prepare("DELETE FROM entries_fts WHERE entry_id = ?").bind(entryId),
    db
      .prepare(
        "INSERT INTO entries_fts (entry_id, title, body, tags) VALUES (?, ?, ?, ?)",
      )
      .bind(entryId, row?.title ?? "", row?.body ?? "", tags.join(" ")),
  ]);
}

export async function getEntry(db: D1Database, id: string): Promise<Entry | null> {
  const row = await db
    .prepare("SELECT * FROM entries WHERE id = ?")
    .bind(id)
    .first<EntryRow>();
  if (!row) return null;
  return toEntry(row, await loadTags(db, id));
}

export async function createEntry(
  db: D1Database,
  input: CreateEntryInput,
): Promise<Entry> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO entries
        (id, title, kind, status, verdict, body, source, source_url, attributes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.title,
      input.kind ?? "tool",
      input.status ?? "inbox",
      input.verdict ?? null,
      input.body ?? "",
      input.source ?? "web",
      input.source_url ?? null,
      JSON.stringify(input.attributes ?? {}),
      now,
      now,
    )
    .run();
  if (input.tags?.length) await replaceTags(db, id, input.tags);
  await refreshFts(db, id);
  return (await getEntry(db, id))!;
}

export async function listEntries(
  db: D1Database,
  opts: { status?: EntryStatus; kind?: EntryKind; limit?: number; offset?: number } = {},
): Promise<Entry[]> {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (opts.status) {
    clauses.push("status = ?");
    binds.push(opts.status);
  }
  if (opts.kind) {
    clauses.push("kind = ?");
    binds.push(opts.kind);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const { results } = await db
    .prepare(`SELECT * FROM entries ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, limit, offset)
    .all<EntryRow>();
  return Promise.all(results.map(async (r) => toEntry(r, await loadTags(db, r.id))));
}

export async function updateEntry(
  db: D1Database,
  id: string,
  patch: UpdateEntryInput,
): Promise<Entry> {
  const current = await getEntry(db, id);
  if (!current) throw new Error(`entry not found: ${id}`);
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE entries SET title=?, kind=?, status=?, verdict=?, body=?, source_url=?, attributes=?, updated_at=?
       WHERE id = ?`,
    )
    .bind(
      patch.title ?? current.title,
      patch.kind ?? current.kind,
      patch.status ?? current.status,
      patch.verdict !== undefined ? patch.verdict : current.verdict,
      patch.body ?? current.body,
      patch.source_url !== undefined ? patch.source_url : current.source_url,
      JSON.stringify(patch.attributes ?? current.attributes),
      now,
      id,
    )
    .run();
  if (patch.tags) await replaceTags(db, id, patch.tags);
  await refreshFts(db, id);
  return (await getEntry(db, id))!;
}

export async function deleteEntry(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM entries_fts WHERE entry_id = ?").bind(id),
    db.prepare("DELETE FROM entry_tags WHERE entry_id = ?").bind(id),
    db.prepare("DELETE FROM entries WHERE id = ?").bind(id),
  ]);
}
