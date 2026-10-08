import type { EntryKind } from "../db/types";

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

export async function callTool(
  _db: D1Database,
  name: string,
  _args: Record<string, unknown>,
): Promise<ToolResult> {
  return fail(`tool not implemented: ${name}`);
}
