export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function upsertUserByEmail(
  db: D1Database,
  email: string,
): Promise<{ id: string; email: string }> {
  const normalized = email.trim().toLowerCase();
  const existing = await db
    .prepare("SELECT id, email FROM users WHERE email = ?")
    .bind(normalized)
    .first<{ id: string; email: string }>();
  if (existing) return existing;
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)")
    .bind(id, normalized, new Date().toISOString())
    .run();
  return { id, email: normalized };
}

export async function createSession(
  db: D1Database,
  userId: string,
  deviceLabel: string | null,
  ttlHours = 720,
): Promise<{ token: string; id: string; expiresAt: string }> {
  const id = crypto.randomUUID();
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 3600_000).toISOString();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, device_label, created_at, last_used_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      userId,
      await sha256Hex(token),
      deviceLabel,
      now.toISOString(),
      now.toISOString(),
      expiresAt,
    )
    .run();
  return { token, id, expiresAt };
}

export async function getActiveSession(
  db: D1Database,
  token: string,
): Promise<{ id: string; userId: string; expiresAt: string } | null> {
  const hash = await sha256Hex(token);
  const row = await db
    .prepare("SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE token_hash = ?")
    .bind(hash)
    .first<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>();
  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  await db
    .prepare("UPDATE sessions SET last_used_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), row.id)
    .run();
  return { id: row.id, userId: row.user_id, expiresAt: row.expires_at };
}

export async function revokeSession(db: D1Database, sessionId: string): Promise<void> {
  await db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), sessionId)
    .run();
}

export async function revokeAllSessions(db: D1Database, userId: string): Promise<number> {
  const result = await db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), userId)
    .run();
  return result.meta.changes ?? 0;
}
