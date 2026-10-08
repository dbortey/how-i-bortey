import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Access } from "./Access";
import * as api from "@/lib/api";

function renderAccess() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Access /></QueryClientProvider>);
}

describe("Access", () => {
  it("lists sessions and mints a token", async () => {
    vi.spyOn(api, "listSessions").mockResolvedValue([
      { id: "s1", device_label: "laptop", created_at: new Date().toISOString(), last_used_at: null, expires_at: new Date().toISOString() },
    ]);
    const mint = vi.spyOn(api, "mintToken").mockResolvedValue({ token: "tok_123", id: "t1", expiresAt: new Date().toISOString() });
    renderAccess();
    expect(await screen.findByText("laptop")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(await screen.findByText("tok_123")).toBeInTheDocument();
    expect(mint).toHaveBeenCalledWith("mcp client");
  });
});
