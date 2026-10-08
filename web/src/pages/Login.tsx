import { useState } from "react";
import { requestMagicLink } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await requestMagicLink(email);
      setDevLink(res.devLink ?? null);
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <Card className="mx-auto mt-16 max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={submit} className="space-y-3">
          <Input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full">Send sign-in link</Button>
        </form>
        {state === "sent" && (
          <p className="text-sm text-muted-foreground">
            Check your email for the sign-in link.
            {devLink && (
              <>
                {" "}Dev link: <a className="underline" href={devLink}>open</a>
              </>
            )}
          </p>
        )}
        {state === "error" && <p className="text-sm text-destructive">Could not send the link. Try again.</p>}
      </CardContent>
    </Card>
  );
}
