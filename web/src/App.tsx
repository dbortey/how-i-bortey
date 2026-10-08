import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";

function Stub({ name }: { name: string }) {
  return <p className="text-muted-foreground">{name} — coming in a later task.</p>;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Stub name="Library" />} />
        <Route path="/library" element={<Stub name="Library" />} />
        <Route path="/capture" element={<Stub name="Capture" />} />
        <Route path="/inbox" element={<Stub name="Inbox" />} />
        <Route path="/access" element={<Stub name="Access" />} />
        <Route path="*" element={<Stub name="Not found" />} />
      </Route>
    </Routes>
  );
}
