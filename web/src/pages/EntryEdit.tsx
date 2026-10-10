import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAddLink, useAddRelation, useEntries, useEntry, useUpdateEntry } from "@/lib/entries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Entry } from "@/lib/entries";

interface Relation { id: string; type: string; verdict: string | null; reason: string | null; related: { id: string; title: string } | null }
interface Link { id: string; url: string; title: string | null; kind: string | null }

const KINDS = ["tool", "workflow", "decision", "note"];
const VERDICTS = ["use", "avoid", "watching"];
const RELATION_VERDICTS = ["chosen", "considered", "rejected", "watching"];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
      {children}
    </h2>
  );
}

export function EntryEdit() {
  const { id = "" } = useParams();
  const { data, isPending, isError } = useEntry(id);
  const update = useUpdateEntry(id);
  const addLink = useAddLink(id);
  const addRelation = useAddRelation(id);
  const all = useEntries("");

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("tool");
  const [verdict, setVerdict] = useState("none");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [rating, setRating] = useState("");
  const [pricing, setPricing] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [relTarget, setRelTarget] = useState("");
  const [relType, setRelType] = useState("alternative_of");
  const [relVerdict, setRelVerdict] = useState("");
  const [relReason, setRelReason] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const seededId = useRef<string | null>(null);

  useEffect(() => {
    if (data && seededId.current !== data.id) {
      seededId.current = data.id;
      setTitle(data.title);
      setKind(data.kind || "tool");
      setVerdict(data.verdict ?? "none");
      setBody(data.body);
      setTags(data.tags.join(", "));
      setRating(String(data.attributes.my_rating ?? ""));
      setPricing(String(data.attributes.pricing_model ?? ""));
    }
  }, [data]);

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Could not load this entry.</p>;

  const entry = data as Entry & { links: Link[]; relations: Relation[] };

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setTitleError("Title is required."); return; }
    setTitleError(null);
    update.mutate(
      {
        title: title.trim(),
        kind,
        verdict: verdict === "none" ? undefined : verdict,
        body,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        attributes: {
          ...entry.attributes,
          my_rating: rating ? Number(rating) : undefined,
          pricing_model: pricing || undefined,
        },
      },
      { onSuccess: () => toast.success("Saved."), onError: () => toast.error("Could not save.") },
    );
  }

  return (
    <div>
      <PageHeader kicker="Library" title="Entry" />

      <div className="grid gap-10 md:grid-cols-[3fr_2fr] md:items-start md:gap-8">
        <form onSubmit={save} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            {titleError && <p className="text-sm text-destructive">{titleError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Notes</Label>
            <Textarea id="body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="kind">Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="verdict">Verdict</Label>
              <Select value={verdict} onValueChange={setVerdict}>
                <SelectTrigger id="verdict"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {VERDICTS.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rating">My rating (1–5)</Label>
              <Input id="rating" type="number" min={1} max={5} value={rating} onChange={(e) => setRating(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricing">Pricing</Label>
              <Select value={pricing} onValueChange={setPricing}>
                <SelectTrigger id="pricing"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {["subscription", "one-time", "freemium", "open-source"].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={update.isPending}>Save</Button>
        </form>

        <aside className="space-y-8">
          {entry.media && entry.media.length > 0 && (
            <section className="md:border-l md:border-border md:pl-6">
              <SectionLabel>Media</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {entry.media.map((m) => (
                  <Dialog key={m.id}>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        aria-label="Open larger preview"
                        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <img
                          src={`/media/${m.id}`}
                          alt=""
                          className="h-24 w-24 cursor-zoom-in border border-border object-cover"
                        />
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl p-2">
                      <DialogTitle className="sr-only">Image preview</DialogTitle>
                      <img src={`/media/${m.id}`} alt="" className="max-h-[80vh] w-full object-contain" />
                    </DialogContent>
                  </Dialog>
                ))}
              </div>
            </section>
          )}

          <section className="md:border-l md:border-border md:pl-6">
            <SectionLabel>Alternatives</SectionLabel>
            <ul className="space-y-2">
              {entry.relations.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{r.related?.title ?? "(missing)"}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {r.type}
                  </span>
                  {r.verdict && <Badge variant="outline">{r.verdict}</Badge>}
                </li>
              ))}
              {entry.relations.length === 0 && (
                <li className="text-sm text-muted-foreground">No alternatives recorded.</li>
              )}
            </ul>
            <div className="mt-4 space-y-2">
              <Select value={relTarget} onValueChange={setRelTarget}>
                <SelectTrigger aria-label="Related entry"><SelectValue placeholder="Choose an entry…" /></SelectTrigger>
                <SelectContent>
                  {(all.data ?? []).filter((e) => e.id !== id).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Select value={relType} onValueChange={setRelType}>
                  <SelectTrigger aria-label="Relation type" className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["alternative_of", "supersedes", "pairs_with"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={relVerdict} onValueChange={setRelVerdict}>
                  <SelectTrigger aria-label="Relation verdict" className="flex-1"><SelectValue placeholder="Verdict" /></SelectTrigger>
                  <SelectContent>
                    {RELATION_VERDICTS.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input aria-label="Reason" placeholder="Reason" value={relReason} onChange={(e) => setRelReason(e.target.value)} />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  if (!relTarget) return;
                  addRelation.mutate(
                    { to_entry: relTarget, type: relType, verdict: relVerdict || undefined, reason: relReason || undefined },
                    { onSuccess: () => { setRelVerdict(""); setRelReason(""); toast.success("Relation added."); } },
                  );
                }}
              >
                Add
              </Button>
            </div>
          </section>

          <section className="md:border-l md:border-border md:pl-6">
            <SectionLabel>Links</SectionLabel>
            <ul className="space-y-2">
              {entry.links.map((l) => (
                <li key={l.id} className="truncate">
                  <a className="underline underline-offset-4" href={l.url} target="_blank" rel="noreferrer">
                    {l.title ?? l.url}
                  </a>
                </li>
              ))}
              {entry.links.length === 0 && (
                <li className="text-sm text-muted-foreground">No links yet.</li>
              )}
            </ul>
            <div className="mt-4 flex gap-2">
              <Input placeholder="https://…" aria-label="New link URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!linkUrl.trim()) return;
                  addLink.mutate({ url: linkUrl.trim() }, { onSuccess: () => { setLinkUrl(""); toast.success("Link added."); } });
                }}
              >
                Add link
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
