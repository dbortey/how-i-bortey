import type { EntryKind } from "../db/types";
import { getEntry } from "../db/entries";
import { searchEntries } from "../db/search";
import { getRelations } from "../db/relations";
import { getLinks } from "../db/links";
import { listTags } from "../db/tags";

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
