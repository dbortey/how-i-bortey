import { Link } from "react-router-dom";
import { useFileEntry, useInbox } from "@/lib/entries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";

export function Inbox() {
  const { data, isPending, isError } = useInbox();
  const file = useFileEntry();

  return (
    <div>
      <PageHeader kicker="Needs tidying" title="Inbox" />
      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Could not load your inbox.</p>}
      {!isPending && !isError && data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">Inbox is clear. Nothing to tidy.</p>
      )}
      {data && data.length > 0 && (
        <ul className="border-t border-border">
          {data.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-4 border-b border-border py-3">
              <Link to={`/library/${e.id}`} className="truncate text-[15px] font-medium tracking-tight hover:underline">
                {e.title}
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  file.mutate(e.id, {
                    onSuccess: () => toast.success("Filed."),
                    onError: () => toast.error("Could not file it."),
                  })
                }
              >
                Mark filed
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
