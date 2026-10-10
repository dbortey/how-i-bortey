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
  const sorted = [...entries].sort((a, b) =>
    a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const lines = ["# How I Bortey — Library", "", `${entries.length} entries.`, ""];
  for (const e of sorted) {
    lines.push(`- [${e.title}](${mirrorPath(e)})`);
  }
  return lines.join("\n") + "\n";
}
