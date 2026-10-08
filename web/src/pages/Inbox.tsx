import { Link } from "react-router-dom";
import { useFileEntry, useInbox } from "@/lib/entries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export function Inbox() {
  const { data, isPending, isError } = useInbox();
  const file = useFileEntry();

  if (isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (isError) return <p className="text-destructive">Could not load your inbox.</p>;
  if (!data || data.length === 0) return <p className="text-muted-foreground">Inbox is clear. Nothing to tidy.</p>;

  return (
    <ul className="space-y-2">
      {data.map((e) => (
        <li key={e.id}>
          <Card className="flex items-center justify-between p-4">
            <Link to={`/library/${e.id}`} className="font-medium hover:underline">{e.title}</Link>
            <Button
              variant="secondary"
              onClick={() =>
                file.mutate(e.id, { onSuccess: () => toast.success("Filed."), onError: () => toast.error("Could not file it.") })
              }
            >
              Mark filed
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );
}
