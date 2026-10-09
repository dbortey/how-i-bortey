export type EntryKind = "tool" | "workflow" | "decision" | "note";
export type EntryStatus = "inbox" | "filed" | "archived";
export type EntryVerdict = "use" | "avoid" | "watching";
export type EntrySource = "web" | "telegram" | "mcp" | "email";

export interface Entry {
  id: string;
  title: string;
  kind: EntryKind;
  status: EntryStatus;
  verdict: EntryVerdict | null;
  body: string;
  source: EntrySource;
  source_url: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface CreateEntryInput {
  title: string;
  kind?: EntryKind;
  status?: EntryStatus;
  verdict?: EntryVerdict | null;
  body?: string;
  source?: EntrySource;
  source_url?: string | null;
  attributes?: Record<string, unknown>;
  tags?: string[];
}

export interface UpdateEntryInput {
  title?: string;
  kind?: EntryKind;
  status?: EntryStatus;
  verdict?: EntryVerdict | null;
  body?: string;
  source_url?: string | null;
  attributes?: Record<string, unknown>;
  tags?: string[];
}
