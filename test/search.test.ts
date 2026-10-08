import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "./reset";
import { createEntry, updateEntry } from "../src/db/entries";
import { searchEntries, toFtsQuery } from "../src/db/search";

beforeEach(resetDb);

describe("toFtsQuery", () => {
  it("wraps terms in quotes so FTS syntax chars are literal", () => {
    expect(toFtsQuery('lightroom OR "capture"')).toBe(
      '"lightroom" "OR" """capture"""',
    );
    expect(toFtsQuery("photo*")).toBe('"photo*"');
  });

  it("returns empty string for blank input", () => {
    expect(toFtsQuery("   ")).toBe("");
  });
});

describe("searchEntries", () => {
  it("finds an entry by body text", async () => {
    await createEntry(env.DB, { title: "Capture One", body: "my preferred photo editor" });
    const results = await searchEntries(env.DB, "photo editor");
    expect(results.map((e) => e.title)).toEqual(["Capture One"]);
  });

  it("finds by tag", async () => {
    await createEntry(env.DB, { title: "Darktable", tags: ["photography"] });
    const results = await searchEntries(env.DB, "photography");
    expect(results.map((e) => e.title)).toEqual(["Darktable"]);
  });

  it("does not throw on FTS syntax characters", async () => {
    await createEntry(env.DB, { title: "Lightroom", body: "adobe subscription" });
    await expect(searchEntries(env.DB, 'lightroom OR "capture" *')).resolves.toBeInstanceOf(
      Array,
    );
  });

  it("returns nothing for a blank query", async () => {
    await createEntry(env.DB, { title: "X" });
    expect(await searchEntries(env.DB, "   ")).toEqual([]);
  });

  it("reflects updates (FTS stays in sync)", async () => {
    const e = await createEntry(env.DB, { title: "Darktable", body: "open source" });
    await updateEntry(env.DB, e.id, { body: "rawtherapee fork" });
    expect((await searchEntries(env.DB, "rawtherapee")).map((x) => x.id)).toEqual([e.id]);
    expect(await searchEntries(env.DB, "open source")).toEqual([]);
  });
});
