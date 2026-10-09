import PostalMime from "postal-mime";
import { createEntry } from "../db/entries";

export interface InboundMessage {
  from: string;
  headers: Headers;
  raw: ReadableStream;
}

function firstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)>"']+/);
  return match ? match[0] : null;
}

function fallbackText(raw: ArrayBuffer): string {
  const decoded = new TextDecoder().decode(raw).trim();
  const match = /\r?\n\r?\n/.exec(decoded);
  if (!match) return decoded;
  return decoded.slice(match.index + match[0].length).trim();
}

export async function handleInboundEmail(message: InboundMessage, env: Env): Promise<void> {
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await new PostalMime().parse(raw);
  const text = (parsed.text ?? "").trim() || fallbackText(raw);
  const subject = (parsed.subject ?? message.headers.get("subject") ?? "").trim();
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  const title = (subject || firstLine || "Email note").slice(0, 120);
  const url = firstUrl(text);
  await createEntry(env.DB, {
    title,
    body: text,
    source: "email",
    status: "inbox",
    source_url: url,
  });
}
