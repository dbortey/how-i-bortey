import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listSessions, logout, mintToken, reindex as apiReindex, revokeAll } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";

export function Access() {
  const [label, setLabel] = useState("mcp client");
  const [minted, setMinted] = useState<string | null>(null);
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: listSessions });

  const mint = useMutation({
    mutationFn: () => mintToken(label),
    onSuccess: (res) => {
      setMinted(res.token);
      toast.success("Token created. Copy it now — it is shown once.");
    },
    onError: () => toast.error("Could not create a token."),
  });

  const reindex = useMutation({
    mutationFn: () => apiReindex(),
    onSuccess: (r) => {
      if (r.embedded > 0) toast.success(`Index rebuilt (${r.embedded}/${r.total}).`);
      else if (r.failed > 0) toast.error("Index rebuild failed — nothing was embedded.");
      else toast.info("Already up to date.");
    },
    onError: () => toast.error("Index rebuild failed — nothing was embedded."),
  });

  async function killSwitch() {
    if (!confirm("Revoke every connected device, including this one?")) return;
    try {
      await revokeAll();
    } catch {
      toast.error("Could not revoke devices. Nothing was signed out.");
      return;
    }
    toast.success("All devices revoked. Signing you out.");
    await logout().catch(() => {});
    queryClient.clear();
    window.location.reload();
  }

  return (
    <div>
      <PageHeader kicker="Security" title="Access" />

      <section className="border-t border-border py-6">
        <h2 className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          MCP token
        </h2>
        <p className="mb-4 max-w-lg text-sm text-muted-foreground">
          Mint a short-lived token an AI client can use against <span className="font-mono">/mcp</span>. It is
          shown once.
        </p>
        <div className="flex max-w-md gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Token label" />
          <Button onClick={() => mint.mutate()} disabled={mint.isPending}>Create</Button>
        </div>
        {minted && (
          <code className="mt-3 block max-w-md break-all border border-border bg-muted p-2 font-mono text-xs">
            {minted}
          </code>
        )}
      </section>

      <section className="border-t border-border py-6">
        <h2 className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Connected devices
        </h2>
        {sessions.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {sessions.isError && <p className="text-sm text-destructive">Could not load devices.</p>}
        <ul className="mb-4 max-w-lg">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
              <span>{s.device_label ?? "unknown"}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                expires {new Date(s.expires_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
        <Button variant="destructive" onClick={killSwitch}>Log out everywhere</Button>
      </section>

      <section className="border-t border-border py-6">
        <h2 className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Search index
        </h2>
        <p className="mb-4 max-w-lg text-sm text-muted-foreground">
          Recompute semantic embeddings for entries that don't have them yet.
        </p>
        <Button variant="outline" onClick={() => reindex.mutate()} disabled={reindex.isPending}>
          Rebuild search index
        </Button>
      </section>
    </div>
  );
}
