import { useState } from "react";
import { Link } from "react-router-dom";
import { useEntries } from "@/lib/entries";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all";

export function Library() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const { data, isPending, isError } = useEntries(query, {
    status: status === ALL ? undefined : status,
    kind: kind === ALL ? undefined : kind,
  });

  return (
    <div className="space-y-4">
      <Input placeholder="Search your library…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status" className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="inbox">Inbox</SelectItem>
            <SelectItem value="filed">Filed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger aria-label="Kind" className="w-[140px]">
            <SelectValue placeholder="Kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All kinds</SelectItem>
            <SelectItem value="tool">Tool</SelectItem>
            <SelectItem value="workflow">Workflow</SelectItem>
            <SelectItem value="decision">Decision</SelectItem>
            <SelectItem value="note">Note</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
