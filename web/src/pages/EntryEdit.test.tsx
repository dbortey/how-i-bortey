import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EntryEdit } from "./EntryEdit";
import * as api from "@/lib/api";

afterEach(() => vi.restoreAllMocks());

function entryData(over: Record<string, unknown> = {}) {
  return { id: "e1", title: "Capture One", kind: "tool", status: "filed", verdict: null, body: "notes", source_url: null, attributes: { my_rating: 5 }, tags: ["photo"], links: [], relations: [], ...over };
}

function renderEdit() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/library/e1"]}>
        <Routes><Route path="/library/:id" element={<EntryEdit />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { qc, ...result };
}

describe("EntryEdit", () => {
  it("loads an entry and blocks a blank title save", async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(api, "api").mockImplementation(async (path: string) => {
      if (path === "/entries/e1") return entryData();
      return [];
    });
    renderEdit();
    expect(await screen.findByDisplayValue("Capture One")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Title"));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
  });

  it("preserves unsaved edits when the same entry refetches", async () => {
    const user = userEvent.setup({ delay: null });
    let calls = 0;
    vi.spyOn(api, "api").mockImplementation(async (path: string) => {
      if (path === "/entries/e1") {
        calls += 1;
        return calls > 1 ? entryData({ links: [{ id: "l1", url: "https://x.test", title: null, kind: null }] }) : entryData();
      }
      return [];
    });
    const { qc } = renderEdit();
    await screen.findByDisplayValue("Capture One");
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Edited Title");
    await act(async () => { await qc.refetchQueries({ queryKey: ["entry", "e1"] }); });
    expect(await screen.findByText("https://x.test")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Edited Title");
  }, 15000);

  it("patches kind and verdict", async () => {
    const user = userEvent.setup({ delay: null });
    const spy = vi.spyOn(api, "api").mockImplementation(async (path: string) => {
      if (path === "/entries/e1") return entryData();
      return [];
    });
    renderEdit();
    await screen.findByDisplayValue("Capture One");
    await user.click(screen.getByLabelText("Kind"));
    await user.click(await screen.findByRole("option", { name: "decision" }));
    await user.click(screen.getByLabelText("Verdict"));
    await user.click(await screen.findByRole("option", { name: "avoid" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(spy).toHaveBeenCalledWith(
      "/entries/e1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"kind":"decision"') }),
    );
    expect(spy).toHaveBeenCalledWith(
      "/entries/e1",
      expect.objectContaining({ body: expect.stringContaining('"verdict":"avoid"') }),
    );
  }, 15000);

  it("posts a relation with verdict and reason", async () => {
    const user = userEvent.setup({ delay: null });
    const spy = vi.spyOn(api, "api").mockImplementation(async (path: string) => {
      if (path === "/entries/e1") return entryData();
      if (path === "/entries") return [entryData(), entryData({ id: "e2", title: "Lightroom" })];
      return [];
    });
    renderEdit();
    await screen.findByDisplayValue("Capture One");
    await user.click(screen.getByLabelText("Related entry"));
    await user.click(await screen.findByRole("option", { name: "Lightroom" }));
    await user.click(screen.getByLabelText("Relation verdict"));
    await user.click(await screen.findByRole("option", { name: "rejected" }));
    await user.type(screen.getByLabelText("Reason"), "costly subscription");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    expect(spy).toHaveBeenCalledWith(
      "/entries/e1/relations",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"verdict":"rejected"') }),
    );
    expect(spy).toHaveBeenCalledWith(
      "/entries/e1/relations",
      expect.objectContaining({ body: expect.stringContaining('"reason":"costly subscription"') }),
    );
  }, 15000);
});
