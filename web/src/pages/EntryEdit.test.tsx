import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EntryEdit } from "./EntryEdit";
import * as api from "@/lib/api";

function renderEdit() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/library/e1"]}>
        <Routes><Route path="/library/:id" element={<EntryEdit />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EntryEdit", () => {
  it("loads an entry and blocks a blank title save", async () => {
    vi.spyOn(api, "api").mockImplementation(async (path: string) => {
      if (path === "/entries/e1") return { id: "e1", title: "Capture One", kind: "tool", status: "filed", verdict: null, body: "notes", source_url: null, attributes: { my_rating: 5 }, tags: ["photo"], links: [], relations: [] };
      return [];
    });
    renderEdit();
    expect(await screen.findByDisplayValue("Capture One")).toBeInTheDocument();

    const title = screen.getByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
  });
});
