import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { AppShell } from "./AppShell";
import * as api from "@/lib/api";

function renderShell() {
  vi.spyOn(api, "api").mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/library"]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/library" element={<p>library body</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe("AppShell", () => {
  it("renders the sidebar navigation and the routed outlet", () => {
    renderShell();
    expect(screen.getAllByText("How I Bortey").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Capture" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Access" })).toBeInTheDocument();
    expect(screen.getByText("library body")).toBeInTheDocument();
  });

  it("exposes a search field and a new-entry action", () => {
    renderShell();
    expect(screen.getByLabelText("Search library")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new entry/i })).toBeInTheDocument();
  });
});
