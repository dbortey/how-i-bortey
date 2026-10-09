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

  it("extracts readable text from an HTML-only email", async () => {
    const enc = new TextEncoder();
    const htmlOnly = {
      from: "owner@example.com",
      headers: new Headers({ subject: "Html capture" }),
      raw: new ReadableStream({
        start(c) {
          c.enqueue(
            enc.encode(
              [
                "From: owner@example.com",
                "Subject: Html capture",
                "Content-Type: text/html; charset=utf-8",
                "",
                "<p>Open source <b>raw</b> editor</p>",
              ].join("\r\n"),
            ),
          );
          c.close();
        },
      }),
    };
    await handleInboundEmail(htmlOnly, env);
    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries[0].body).toContain("Open source raw editor");
    expect(entries[0].body).not.toContain("<");
  });

  it("still creates an entry when the MIME body cannot be parsed", async () => {
    const enc = new TextEncoder();
    let nested = 'Content-Type: multipart/mixed; boundary="b"\r\n\r\n';
    for (let i = 0; i < 300; i++) {
      nested += '--b\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n';
    }
    const malformed = {
      from: "owner@example.com",
      headers: new Headers({ subject: "Broken MIME" }),
      raw: new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(nested));
          c.close();
        },
      }),
    };
    await expect(handleInboundEmail(malformed, env)).resolves.toBeUndefined();
    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("email");
    expect(entries[0].title).toBe("Broken MIME");
  });

  it("trims trailing sentence punctuation from an extracted URL", async () => {
    const enc = new TextEncoder();
    const trailing = {
      from: "owner@example.com",
      headers: new Headers({ subject: "Link" }),
      raw: new ReadableStream({
        start(c) {
          c.enqueue(
            enc.encode(
              [
                "From: owner@example.com",
                "Subject: Link",
                "Content-Type: text/plain; charset=utf-8",
                "",
                "See https://example.com.",
              ].join("\r\n"),
            ),
          );
          c.close();
        },
      }),
    };
    await handleInboundEmail(trailing, env);
    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries[0].source_url).toBe("https://example.com");
  });
});
