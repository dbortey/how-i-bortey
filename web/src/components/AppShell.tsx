import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { BookOpen, Inbox as InboxIcon, KeyRound, PenLine, Plus, Search } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./ThemeToggle";
import { useInbox } from "@/lib/entries";
import { logout } from "@/lib/api";

const NAV = [
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/capture", label: "Capture", icon: PenLine },
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/access", label: "Access", icon: KeyRound },
];

function SearchField() {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/library?q=${encodeURIComponent(q.trim())}` : "/library");
        setOpenMobile(false);
      }}
      className="px-2 pb-2 pt-1"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search library"
          aria-label="Search library"
          className="h-9 pl-8 text-sm"
        />
      </div>
    </form>
  );
}

function NavItems() {
  const { pathname } = useLocation();
  const { data } = useInbox();
  const inboxCount = data?.length ?? 0;
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton asChild isActive={active} tooltip={label}>
                  <Link to={to}>
                    <Icon />
                    <span>{label}</span>
                    {label === "Inbox" && inboxCount > 0 && (
                      <span className="ml-auto font-mono text-[10px] tabular-nums text-brand group-data-[collapsible=icon]:hidden">
                        {inboxCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AccountFooter() {
  async function handleLogout() {
    await logout().catch(() => {});
    window.location.href = "/";
  }
  return (
    <div className="flex items-center justify-between gap-1 px-1 py-0.5">
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            Account
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-44">
          <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Signed in
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>Log out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AppShell() {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex items-center gap-2 px-1 py-1.5">
            <span className="grid size-7 shrink-0 place-items-center bg-brand font-mono text-[12px] font-medium text-white">
              B
            </span>
            <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              How I Bortey
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SearchField />
          <div className="px-2 pb-2">
            <Button asChild size="sm" className="w-full justify-start gap-2">
              <Link to="/capture">
                <Plus className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden">New entry</span>
              </Link>
            </Button>
          </div>
          <NavItems />
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <AccountFooter />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b bg-background/85 px-3 backdrop-blur">
          <SidebarTrigger />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            How I Bortey
          </span>
        </header>
        <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
