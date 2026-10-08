import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Library } from "./Library";
import * as api from "@/lib/api";

function renderLibrary() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Library /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Library", () => {
  it("shows an empty state when there are no entries", async () => {
    vi.spyOn(api, "api").mockResolvedValue([]);
    renderLibrary();
    expect(await screen.findByText(/your library is empty/i)).toBeInTheDocument();
  });

  it("renders entries and searches by query", async () => {
    const entry = { id: "1", title: "Capture One", kind: "tool", status: "filed", verdict: null, body: "", source_url: null, attributes: {}, tags: ["photography"] };
    const spy = vi.spyOn(api, "api").mockImplementation((path: string) =>
      Promise.resolve(path.includes("q=photo") ? [] : [entry]),
    );
    renderLibrary();
    expect(await screen.findByText("Capture One")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/search your library/i), "photo");
    expect(await screen.findByText(/no entries match/i)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("/entries?q=photo"));
  });
});
