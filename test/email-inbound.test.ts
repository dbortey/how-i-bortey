import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "./reset";
import { listEntries } from "../src/db/entries";
import { handleInboundEmail } from "../src/email/inbound";

beforeEach(resetDb);

const RAW = [
  "From: owner@example.com",
  "To: capture@switgh.com",
  "Subject: Try Darktable",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Open source raw editor.",
  "Docs: https://www.darktable.org/resources/",
].join("\r\n");

function message(raw: string) {
  const encoder = new TextEncoder();
  return {
    from: "owner@example.com",
    headers: new Headers({ subject: "Try Darktable" }),
    raw: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(raw));
        controller.close();
      },
    }),
  };
}

describe("inbound email capture", () => {
  it("creates an inbox entry from an email, extracting links", async () => {
    await handleInboundEmail(message(RAW), env);
    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("email");
    expect(entries[0].title).toBe("Try Darktable");
    expect(entries[0].body).toContain("Open source raw editor");
    expect(entries[0].source_url).toBe("https://www.darktable.org/resources/");
  });

  it("uses the first body line as title when there is no subject", async () => {
    const enc = new TextEncoder();
    const noSubject = {
      from: "owner@example.com",
      headers: new Headers(),
      raw: new ReadableStream({
        start(c) { c.enqueue(enc.encode("Body line one\r\nmore")); c.close(); },
      }),
    };
    await handleInboundEmail(noSubject, env);
    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries[0].title).toBe("Body line one");
  });
});
