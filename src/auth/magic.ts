import { sha256Hex } from "./sessions";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createMagicToken(
  db: D1Database,
  email: string,
  ttlMinutes = 15,
): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  await db
    .prepare(
      "INSERT INTO magic_tokens (token_hash, email, expires_at, used_at) VALUES (?, ?, ?, NULL)",
    )
    .bind(await sha256Hex(token), email.trim().toLowerCase(), expiresAt)
    .run();
  return token;
}

export async function hasPendingMagicToken(
  db: D1Database,
  email: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 FROM magic_tokens WHERE email = ? AND used_at IS NULL AND expires_at > ? LIMIT 1",
    )
    .bind(email.trim().toLowerCase(), new Date().toISOString())
    .first();
  return !!row;
}

export async function consumeMagicToken(
  db: D1Database,
  token: string,
): Promise<string | null> {
  const hash = await sha256Hex(token);
  const row = await db
    .prepare("SELECT email, expires_at, used_at FROM magic_tokens WHERE token_hash = ?")
    .bind(hash)
    .first<{ email: string; expires_at: string; used_at: string | null }>();
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  const updated = await db
    .prepare("UPDATE magic_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL")
    .bind(new Date().toISOString(), hash)
    .run();
  if ((updated.meta.changes ?? 0) === 0) return null;
  return row.email;
}
