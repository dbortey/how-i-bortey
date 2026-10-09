import { createEntry } from "../db/entries";

interface TgMessage {
  message_id?: number;
  chat?: { id?: number };
  text?: string;
  caption?: string;
  photo?: Array<{ file_id?: string }>;
}

async function sendMessage(env: Env, chatId: number, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function handleUpdate(env: Env, update: Record<string, unknown>): Promise<void> {
  const message = update.message as TgMessage | undefined;
  if (!message) return;
  const chatId = message.chat?.id;
  const text = message.text;
  if (typeof text === "string" && text.trim() && typeof chatId === "number") {
    const [firstLine, ...rest] = text.trim().split("\n");
    await createEntry(env.DB, {
      title: firstLine.slice(0, 120),
      body: rest.join("\n").trim(),
      source: "telegram",
      status: "inbox",
    });
    await sendMessage(env, chatId, `Saved: ${firstLine.slice(0, 120)}`);
  }
}
