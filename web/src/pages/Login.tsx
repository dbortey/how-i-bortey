import { useState } from "react";
import { requestMagicLink } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-8 place-items-center bg-brand font-mono text-[13px] font-medium text-white">
            B
          </span>
          <span className="text-sm font-semibold tracking-tight">How I Bortey</span>
        </div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          We'll email you a one-time sign-in link.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="email"
            required
            placeholder="you@example.com"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="w-full">Send sign-in link</Button>
        </form>
        {state === "sent" && (
          <p className="mt-4 text-sm text-muted-foreground">
            Check your email for the sign-in link.
            {devLink && (
              <>
                {" "}Dev link: <a className="underline" href={devLink}>open</a>
              </>
            )}
          </p>
        )}
        {state === "error" && (
          <p className="mt-4 text-sm text-destructive">Could not send the link. Try again.</p>
        )}
      </div>
    </div>
  );
}
