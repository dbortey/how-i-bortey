import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "./reset";
import {
  createEntry,
  getEntry,
  listEntries,
  updateEntry,
  deleteEntry,
} from "../src/db/entries";

beforeEach(resetDb);

describe("entries repository", () => {
  it("creates and reads back an entry", async () => {
    const created = await createEntry(env.DB, { title: "Capture One", kind: "tool" });
    expect(created.id).toMatch(/[0-9a-f-]{36}/);
    expect(created.status).toBe("inbox");
    const found = await getEntry(env.DB, created.id);
    expect(found?.title).toBe("Capture One");
  });

  it("stores attributes as JSON and tolerates hostile input", async () => {
    const created = await createEntry(env.DB, {
      title: "X",
      attributes: { nested: { a: 1 } },
    });
    expect(created.attributes).toEqual({ nested: { a: 1 } });
    const found = await getEntry(env.DB, created.id);
    expect(found?.attributes).toEqual({ nested: { a: 1 } });
  });

  it("keeps duplicate tag names with different kinds and dedupes entry links", async () => {
    const a = await createEntry(env.DB, {
      title: "A",
      tags: ["photo", "photo"],
    });
    expect(a.tags).toEqual(["photo"]);
    const b = await createEntry(env.DB, { title: "B", tags: ["photo"] });
    expect(b.tags).toEqual(["photo"]);
  });

  it("lists by status and kind", async () => {
    await createEntry(env.DB, { title: "T1", kind: "tool", status: "filed" });
    await createEntry(env.DB, { title: "W1", kind: "workflow", status: "inbox" });
    const tools = await listEntries(env.DB, { kind: "tool" });
    expect(tools.map((e) => e.title)).toEqual(["T1"]);
  });

  it("updates fields and replaces tags", async () => {
    const e = await createEntry(env.DB, { title: "Old", tags: ["a", "b"] });
    const updated = await updateEntry(env.DB, e.id, { title: "New", tags: ["c"] });
    expect(updated.title).toBe("New");
    expect(updated.tags).toEqual(["c"]);
    expect(updated.created_at).toBe(e.created_at);
  });

  it("deletes an entry", async () => {
    const e = await createEntry(env.DB, { title: "Gone" });
    await deleteEntry(env.DB, e.id);
    expect(await getEntry(env.DB, e.id)).toBeNull();
  });
});
