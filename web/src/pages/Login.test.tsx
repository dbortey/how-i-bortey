import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Login } from "./Login";
import * as api from "@/lib/api";

describe("Login", () => {
  it("requests a magic link and shows the dev link", async () => {
    vi.spyOn(api, "requestMagicLink").mockResolvedValue({ ok: true, devLink: "/auth/verify?token=abc" });
    render(<Login />);
    await userEvent.type(screen.getByPlaceholderText("you@example.com"), "owner@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send sign-in link/i }));
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute("href", "/auth/verify?token=abc");
  });

  it("shows an error when the request fails", async () => {
    vi.spyOn(api, "requestMagicLink").mockRejectedValue(new Error("boom"));
    render(<Login />);
    await userEvent.type(screen.getByPlaceholderText("you@example.com"), "x@y.z");
    await userEvent.click(screen.getByRole("button", { name: /send sign-in link/i }));
    expect(await screen.findByText(/could not send/i)).toBeInTheDocument();
  });
});
