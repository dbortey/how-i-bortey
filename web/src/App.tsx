import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Login } from "./pages/Login";
import { Library } from "./pages/Library";
import { Capture } from "./pages/Capture";
import { Inbox } from "./pages/Inbox";
import { EntryEdit } from "./pages/EntryEdit";
import { Access } from "./pages/Access";
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
        <Route path="/library/:id" element={<EntryEdit />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/access" element={<Access />} />
        <Route path="*" element={<Stub name="Not found" />} />
      </Route>
    </Routes>
  );
}
