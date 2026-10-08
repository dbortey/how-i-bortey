import { useState } from "react";
import { Link } from "react-router-dom";
import { useEntries } from "@/lib/entries";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function Library() {
  const [query, setQuery] = useState("");
  const { data, isPending, isError } = useEntries(query);

  return (
    <div className="space-y-4">
      <Input placeholder="Search your library…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {isError && <p className="text-destructive">Could not load entries.</p>}
      {data && data.length === 0 && (
        <p className="text-muted-foreground">
          {query ? `No entries match “${query}”.` : "Your library is empty. Add something from Capture."}
        </p>
      )}
      <ul className="space-y-2">
        {data?.map((e) => (
          <li key={e.id}>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/library/${e.id}`} className="font-medium hover:underline">
                  {e.title}
                </Link>
                <div className="flex gap-2">
                  <Badge variant="secondary">{e.kind}</Badge>
                  <Badge variant="outline">{e.status}</Badge>
                </div>
              </div>
              {e.tags.length > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">{e.tags.join(", ")}</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
