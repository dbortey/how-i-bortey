import { createEntry } from "../db/entries";
import { putMedia } from "../media/store";

interface TgMessage {
  message_id?: number;
  chat?: { id?: number };
  text?: string;
  caption?: string;
  photo?: Array<{ file_id?: string }>;
}

// Best-effort reply: a Telegram sendMessage failure must never fail the
// capture, otherwise a retry would duplicate the entry. Errors are swallowed.
async function sendMessage(env: Env, chatId: number, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // Ignore: the capture already succeeded.
  }
}

// Best-effort download: returns null (skip the media) when the bytes are
// unavailable, so the entry's text/caption is never lost to a photo problem.
async function downloadFile(env: Env, fileId: string): Promise<ArrayBuffer | null> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const fileRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    if (!fileRes.ok) return null;
    const data = (await fileRes.json()) as { ok?: boolean; result?: { file_path?: string } };
    const filePath = data.result?.file_path;
    if (!filePath) return null;
    const fileDownload = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!fileDownload.ok) return null;
    return fileDownload.arrayBuffer();
  } catch {
    return null;
  }
}

export async function handleUpdate(env: Env, update: Record<string, unknown>): Promise<void> {
  const message = update.message as TgMessage | undefined;
  if (!message) return;
  const chatId = message.chat?.id;

  if (typeof message.text === "string" && message.text.trim() && typeof chatId === "number") {
    const [firstLine, ...rest] = message.text.trim().split("\n");
    await createEntry(env.DB, {
      title: firstLine.slice(0, 120),
      body: rest.join("\n").trim(),
      source: "telegram",
      status: "inbox",
    });
    await sendMessage(env, chatId, `Saved: ${firstLine.slice(0, 120)}`);
    return;
  }

  if (Array.isArray(message.photo) && message.photo.length > 0 && typeof chatId === "number") {
    const largest = message.photo[message.photo.length - 1];
    const title = (message.caption ?? "Photo").slice(0, 120);
    const entry = await createEntry(env.DB, {
      title,
      body: message.caption ?? "",
      source: "telegram",
      status: "inbox",
    });
    if (largest.file_id) {
      const bytes = await downloadFile(env, largest.file_id);
      if (bytes) {
        await putMedia(env.DB, env.MEDIA, {
          bytes,
          mime: "image/jpeg",
          entryId: entry.id,
          caption: message.caption ?? null,
        });
      }
    }
    await sendMessage(env, chatId, `Saved: ${title}`);
  }
}
