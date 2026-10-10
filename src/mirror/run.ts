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
