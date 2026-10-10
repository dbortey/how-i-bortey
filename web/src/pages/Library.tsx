import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useEntries } from "@/lib/entries";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all";

export function Library() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [status, setStatus] = useState(ALL);
  const [kind, setKind] = useState(ALL);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  const { data, isPending, isError } = useEntries(query, {
    status: status === ALL ? undefined : status,
    kind: kind === ALL ? undefined : kind,
  });

  function onSearch(value: string) {
    setQuery(value);
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    setParams(next, { replace: true });
  }

  return (
    <div>
      <PageHeader kicker="Your library" title="Entries" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search your library…"
          aria-label="Search entries"
          className="sm:max-w-xs"
        />
        <div className="flex gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Status" className="w-[132px]">
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
            <SelectTrigger aria-label="Kind" className="w-[132px]">
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
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Could not load entries.</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {query
            ? `No entries match “${query}”.`
            : "Your library is empty. Add something from Capture."}
        </p>
      )}

      {data && data.length > 0 && (
        <ul className="border-t border-border">
          {data.map((e) => (
            <li key={e.id} className="border-b border-border">
              <Link
                to={`/library/${e.id}`}
                className="flex flex-col gap-1 py-3.5 transition-colors hover:bg-accent/60 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-1"
              >
                <span className="truncate text-[15px] font-medium tracking-tight">{e.title}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>{e.kind}</span>
                  <span aria-hidden>·</span>
                  <span>{e.status}</span>
                  {e.tags.length > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-muted-foreground/70">{e.tags.join(" ")}</span>
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
