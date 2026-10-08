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
