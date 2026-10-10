import PostalMime from "postal-mime";
import { createEntry } from "../db/entries";
import { maybeEmbed } from "../embeddings/ai";

export interface InboundMessage {
  from: string;
  headers: Headers;
  raw: ReadableStream;
}

function firstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)>"']+/);
  return match ? match[0].replace(/[.,;:]+$/, "") : null;
}

function htmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function fallbackText(raw: ArrayBuffer): string {
  const decoded = new TextDecoder().decode(raw).trim();
  const match = /\r?\n\r?\n/.exec(decoded);
  if (!match) return decoded;
  return decoded.slice(match.index + match[0].length).trim();
}

export async function handleInboundEmail(message: InboundMessage, env: Env): Promise<void> {
  const raw = await new Response(message.raw).arrayBuffer();
  // A malformed MIME body must never abort the capture: fall through to the
  // raw-text fallback so an entry is still created from whatever is available.
  let parsed: Awaited<ReturnType<PostalMime["parse"]>> | null = null;
  try {
    parsed = await new PostalMime().parse(raw);
  } catch {
    parsed = null;
  }
  const text =
    (parsed?.text ?? "").trim() ||
    htmlToText(parsed?.html ?? "") ||
    fallbackText(raw);
  const subject = (parsed?.subject ?? message.headers.get("subject") ?? "").trim();
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  const title = (subject || firstLine || "Email note").slice(0, 120);
  const url = firstUrl(text);
  const entry = await createEntry(env.DB, {
    title,
    body: text,
    source: "email",
    status: "inbox",
    source_url: url,
  });
  await maybeEmbed(env, entry.id);
}
