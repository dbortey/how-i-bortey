import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/library", label: "Library" },
  { to: "/capture", label: "Capture" },
  { to: "/inbox", label: "Inbox" },
  { to: "/access", label: "Access" },
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 p-4">
          <span className="font-semibold">How I Bortey</span>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                isActive ? "font-medium underline" : "text-muted-foreground"
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
