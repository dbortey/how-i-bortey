import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Inbox } from "./Inbox";
import * as api from "@/lib/api";

function renderInbox() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><Inbox /></MemoryRouter></QueryClientProvider>,
  );
}

const entry = {
  id: "1",
  title: "Capture One",
  kind: "tool",
  status: "inbox",
  verdict: null,
  body: "",
  source_url: null,
  attributes: {},
  tags: [],
};

describe("Inbox", () => {
  it("shows an empty state when the inbox has no entries", async () => {
    vi.spyOn(api, "api").mockResolvedValue([]);
    renderInbox();
    expect(await screen.findByText(/inbox is clear/i)).toBeInTheDocument();
  });

  it("lists inbox entries and files one", async () => {
    const spy = vi.spyOn(api, "api").mockImplementation((_path: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "PATCH" ? { ...entry, status: "filed" } : [entry]),
    );
    renderInbox();
    expect(await screen.findByText("Capture One")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /mark filed/i }));

    expect(spy).toHaveBeenCalledWith("/entries/1", expect.objectContaining({ method: "PATCH" }));
  });
});
