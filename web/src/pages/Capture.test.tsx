import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Capture } from "./Capture";
import * as api from "@/lib/api";

afterEach(() => vi.restoreAllMocks());

function renderCapture() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><Capture /></MemoryRouter></QueryClientProvider>,
  );
}

describe("Capture", () => {
  it("blocks submission without a title", async () => {
    renderCapture();
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
  });

  it("posts a new entry with parsed tags", async () => {
    const spy = vi.spyOn(api, "api").mockResolvedValue({ id: "1" });
    renderCapture();
    await userEvent.type(screen.getByLabelText("Title"), "RawTherapee");
    await userEvent.type(screen.getByLabelText(/tags/i), "photo, oss");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(spy).toHaveBeenCalledWith(
      "/entries",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"tags":["photo","oss"]') }),
    );
  });

  it("posts the chosen kind", async () => {
    const spy = vi.spyOn(api, "api").mockResolvedValue({ id: "1" });
    renderCapture();
    await userEvent.type(screen.getByLabelText("Title"), "Pick a camera");
    await userEvent.click(screen.getByLabelText("Kind"));
    await userEvent.click(await screen.findByRole("option", { name: "decision" }));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(spy).toHaveBeenCalledWith(
      "/entries",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"kind":"decision"') }),
    );
  });
});
