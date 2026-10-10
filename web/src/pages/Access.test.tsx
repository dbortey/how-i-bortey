import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { Access } from "./Access";
import * as api from "@/lib/api";

function renderAccess() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Access /></QueryClientProvider>);
}

const locationDescriptor = Object.getOwnPropertyDescriptor(window, "location");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (locationDescriptor) Object.defineProperty(window, "location", locationDescriptor);
});

function stubReload() {
  const reload = vi.fn();
  Object.defineProperty(window, "location", { value: { reload }, configurable: true, writable: true });
  return reload;
}

describe("Access", () => {
  it("rebuilds the search index", async () => {
    vi.spyOn(api, "listSessions").mockResolvedValue([]);
    const spy = vi.spyOn(api, "reindex").mockResolvedValue({ embedded: 3, total: 3, failed: 0 });
    renderAccess();
    await userEvent.click(await screen.findByRole("button", { name: /rebuild search index/i }));
    expect(spy).toHaveBeenCalled();
  });

  it("shows a success toast with counts when entries embed", async () => {
    vi.spyOn(api, "listSessions").mockResolvedValue([]);
    vi.spyOn(api, "reindex").mockResolvedValue({ embedded: 3, total: 3, failed: 0 });
    const successSpy = vi.spyOn(toast, "success");
    renderAccess();
    await userEvent.click(await screen.findByRole("button", { name: /rebuild search index/i }));
    expect(successSpy).toHaveBeenCalledWith(expect.stringContaining("3/3"));
  });

  it("shows an error toast when nothing was embedded", async () => {
    vi.spyOn(api, "listSessions").mockResolvedValue([]);
    vi.spyOn(api, "reindex").mockResolvedValue({ embedded: 0, total: 2, failed: 2 });
    const successSpy = vi.spyOn(toast, "success");
    const errorSpy = vi.spyOn(toast, "error");
    renderAccess();
    await userEvent.click(await screen.findByRole("button", { name: /rebuild search index/i }));
    expect(errorSpy).toHaveBeenCalled();
    expect(successSpy).not.toHaveBeenCalled();
  });

  it("shows an error toast when reindex rejects", async () => {
    vi.spyOn(api, "listSessions").mockResolvedValue([]);
    vi.spyOn(api, "reindex").mockRejectedValue(new Error("502"));
    const errorSpy = vi.spyOn(toast, "error");
    renderAccess();
    await userEvent.click(await screen.findByRole("button", { name: /rebuild search index/i }));
    expect(errorSpy).toHaveBeenCalled();
  });

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

  it("revokes, logs out, and reloads in order on the kill switch", async () => {
    vi.spyOn(api, "listSessions").mockResolvedValue([]);
    const revoke = vi.spyOn(api, "revokeAll").mockResolvedValue({ revoked: 2 });
    const logout = vi.spyOn(api, "logout").mockResolvedValue({ ok: true });
    const reload = stubReload();
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderAccess();
    await userEvent.click(await screen.findByRole("button", { name: /log out everywhere/i }));
    expect(revoke).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
    expect(revoke.mock.invocationCallOrder[0]).toBeLessThan(logout.mock.invocationCallOrder[0]);
  });

  it("shows an error and does not sign out when revoke fails", async () => {
    vi.spyOn(api, "listSessions").mockResolvedValue([]);
    vi.spyOn(api, "revokeAll").mockRejectedValue(new Error("boom"));
    const logout = vi.spyOn(api, "logout");
    const reload = stubReload();
    const errorSpy = vi.spyOn(toast, "error");
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderAccess();
    await userEvent.click(await screen.findByRole("button", { name: /log out everywhere/i }));
    expect(errorSpy).toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
