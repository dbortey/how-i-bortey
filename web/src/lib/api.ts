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

export const getMe = () => api<{ userId: string }>("/me");
export const requestMagicLink = (email: string) =>
  api<{ ok: boolean; devLink?: string }>("/auth/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
export const logout = () => api<{ ok: boolean }>("/auth/logout", { method: "POST" });
