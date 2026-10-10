export class ApiError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `API error ${status}`);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new ApiError(res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface SessionInfo {
  id: string;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
}
export const listSessions = () => api<SessionInfo[]>("/access/sessions");
export const mintToken = (label: string) =>
  api<{ token: string; id: string; expiresAt: string }>("/access/tokens", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
export const revokeAll = () => api<{ revoked: number }>("/access/revoke-all", { method: "POST" });

export const reindex = () => api<{ embedded: number; total: number }>("/embeddings/backfill", { method: "POST" });

export const getMe = () => api<{ userId: string }>("/me");
export const requestMagicLink = (email: string) =>
  api<{ ok: boolean; devLink?: string }>("/auth/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
export const logout = () => api<{ ok: boolean }>("/auth/logout", { method: "POST" });
