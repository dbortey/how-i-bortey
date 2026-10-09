import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateEntry } from "@/lib/entries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export function Capture() {
  const nav = useNavigate();
  const create = useCreateEntry();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("tool");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    create.mutate(
      {
        title: title.trim(),
        kind,
        body: body || undefined,
        source_url: url || undefined,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      },
      {
        onSuccess: () => {
          toast.success("Saved to your library.");
          nav("/library");
        },
        onError: () => toast.error("Could not save. Try again."),
      },
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="body">Notes</Label>
        <Textarea id="body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tags">Tags (comma-separated)</Label>
        <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="kind">Kind</Label>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger id="kind"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["tool", "workflow", "decision", "note"].map((k) => (
              <SelectItem key={k} value={k}>{k}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="url">Source URL</Label>
        <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <Button type="submit" disabled={create.isPending}>Save</Button>
    </form>
  );
}
