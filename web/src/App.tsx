import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Login } from "./pages/Login";
import { Library } from "./pages/Library";
import { useSession } from "./lib/query";

function Stub({ name }: { name: string }) {
  return <p className="text-muted-foreground">{name} — coming in a later task.</p>;
}

export function App() {
  const { status } = useSession();
  if (status === "pending") return <p className="p-8 text-muted-foreground">Loading…</p>;
  if (status === "error") return <Login />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Library />} />
        <Route path="/library" element={<Library />} />
        <Route path="/library/:id" element={<Stub name="Entry" />} />
        <Route path="/capture" element={<Stub name="Capture" />} />
        <Route path="/inbox" element={<Stub name="Inbox" />} />
        <Route path="/access" element={<Stub name="Access" />} />
        <Route path="*" element={<Stub name="Not found" />} />
      </Route>
    </Routes>
  );
}
