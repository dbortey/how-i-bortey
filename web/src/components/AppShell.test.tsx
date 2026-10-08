import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the navigation and an outlet", () => {
    render(
      <MemoryRouter initialEntries={["/library"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/library" element={<p>library body</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("How I Bortey")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByText("library body")).toBeInTheDocument();
  });
});
