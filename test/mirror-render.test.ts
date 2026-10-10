import { describe, it, expect } from "vitest";
import { mirrorPath, renderEntryMarkdown, renderIndex } from "../src/mirror/render";
import type { MirrorEntry } from "../src/mirror/render";

function entry(over: Partial<MirrorEntry> = {}): MirrorEntry {
  return {
    id: "31be2146-0000-0000-0000-000000000000",
    title: "Capture One",
    kind: "tool",
    status: "filed",
    verdict: "use",
    body: "Preferred for raw editing.",
    source: "telegram",
    source_url: null,
    attributes: { my_rating: 5 },
    created_at: "2026-10-10T08:12:01.000Z",
    updated_at: "2026-10-10T08:12:01.000Z",
    tags: ["photography", "raw"],
    links: [],
    relations: [],
    media: [],
    ...over,
  };
}

describe("mirrorPath", () => {
  it("slugs the title and appends an id suffix", () => {
    expect(mirrorPath(entry())).toBe("entries/capture-one-31be2146.md");
  });
  it("falls back to a non-empty slug", () => {
    expect(mirrorPath(entry({ title: "💥" }))).toMatch(/^entries\/entry-31be2146\.md$/);
  });
});

describe("renderEntryMarkdown", () => {
  it("renders frontmatter, body, and every non-empty section", () => {
    const md = renderEntryMarkdown(
      entry({
        links: [{ id: "l1", url: "https://darktable.org", title: "Manual", kind: "docs", note: null }],
        relations: [{ id: "r1", type: "alternative_of", verdict: "rejected", reason: "subscription", related: { id: "x", title: "Lightroom", kind: "tool", status: "filed", verdict: null } }],
      }),
    );
    expect(md).toContain('title: "Capture One"');
    expect(md).toContain("tags: [\"photography\", \"raw\"]");
    expect(md).toContain("# Capture One");
    expect(md).toContain("Preferred for raw editing.");
    expect(md).toContain("## Alternatives");
    expect(md).toContain("Lightroom — alternative_of (rejected): subscription");
    expect(md).toContain("## Links");
    expect(md).toContain("[Manual](https://darktable.org)");
  });

  it("renders cleanly for an entry with no relations, links or media", () => {
    const md = renderEntryMarkdown(entry());
    expect(md).not.toContain("## Alternatives");
    expect(md).not.toContain("## Links");
    expect(md).not.toContain("## Media");
  });

  it("survives emoji in the body", () => {
    expect(renderEntryMarkdown(entry({ body: "raw ✨ editor" }))).toContain("raw ✨ editor");
  });
});

describe("renderIndex", () => {
  it("lists entries with a link to each file", () => {
    const idx = renderIndex([entry()]);
    expect(idx).toContain("# How I Bortey — Library");
    expect(idx).toContain("- [Capture One](entries/capture-one-31be2146.md)");
  });
});
