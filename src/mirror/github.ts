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
