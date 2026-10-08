import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession } from "../src/auth/sessions";

beforeEach(resetDb);

async function cookie(): Promise<{ cookie: string; userId: string }> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "laptop");
  return { cookie: `hib_session=${token}`, userId: user.id };
}

describe("access management", () => {
  it("lists connected sessions without leaking tokens", async () => {
    const { cookie: c } = await cookie();
    const res = await SELF.fetch("https://example.com/access/sessions", {
      headers: { cookie: c },
    });
    const sessions = await res.json<Array<Record<string, unknown>>>();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].device_label).toBe("laptop");
    expect(JSON.stringify(sessions)).not.toContain("token");
  });

  it("kill switch revokes every session, including the caller's", async () => {
    const { cookie: c, userId } = await cookie();
    await createSession(env.DB, userId, "phone");
    const revoke = await SELF.fetch("https://example.com/access/revoke-all", {
      method: "POST",
      headers: { cookie: c },
    });
    expect((await revoke.json<{ revoked: number }>()).revoked).toBe(2);

    const after = await SELF.fetch("https://example.com/me", { headers: { cookie: c } });
    expect(after.status).toBe(401);
  });
});
