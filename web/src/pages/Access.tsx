import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listSessions, logout, mintToken, revokeAll } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export function Access() {
  const [label, setLabel] = useState("mcp client");
  const [minted, setMinted] = useState<string | null>(null);
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: listSessions });

  const mint = useMutation({
    mutationFn: () => mintToken(label),
    onSuccess: (res) => { setMinted(res.token); toast.success("Token created. Copy it now — it is shown once."); },
  });

  async function killSwitch() {
    if (!confirm("Revoke every connected device, including this one?")) return;
    await revokeAll();
    toast.success("All devices revoked. Signing you out.");
    await logout().catch(() => {});
    queryClient.clear();
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-4">
        <h2 className="font-medium">MCP token</h2>
        <p className="text-sm text-muted-foreground">Mint a short-lived token an AI client can use against /mcp. It is shown once.</p>
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button onClick={() => mint.mutate()} disabled={mint.isPending}>Create</Button>
        </div>
        {minted && (
          <code className="block break-all rounded bg-muted p-2 text-xs">{minted}</code>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-medium">Connected devices</h2>
        {sessions.isPending && <p className="text-muted-foreground">Loading…</p>}
        <ul className="space-y-1">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span>{s.device_label ?? "unknown"}</span>
              <span className="text-muted-foreground">expires {new Date(s.expires_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
        <Button variant="destructive" onClick={killSwitch}>Log out everywhere</Button>
      </Card>
    </div>
  );
}
