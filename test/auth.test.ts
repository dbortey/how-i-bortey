import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "./reset";
import {
  sha256Hex,
  createSession,
  getActiveSession,
  revokeSession,
  revokeAllSessions,
  upsertUserByEmail,
} from "../src/auth/sessions";
import { createMagicToken, consumeMagicToken } from "../src/auth/magic";

beforeEach(resetDb);

describe("sessions", () => {
  it("hashes deterministically", async () => {
    expect(await sha256Hex("abc")).toBe(await sha256Hex("abc"));
    expect(await sha256Hex("abc")).not.toBe("abc");
  });

  it("creates and retrieves an active session by raw token", async () => {
    const user = await upsertUserByEmail(env.DB, "a@example.com");
    const { token } = await createSession(env.DB, user.id, "test-device");
    const s = await getActiveSession(env.DB, token);
    expect(s?.userId).toBe(user.id);
  });

  it("rejects revoked and expired sessions", async () => {
    const user = await upsertUserByEmail(env.DB, "b@example.com");
    const { token, id } = await createSession(env.DB, user.id, null);
    await revokeSession(env.DB, id);
    expect(await getActiveSession(env.DB, token)).toBeNull();

    const expired = await createSession(env.DB, user.id, null, -1);
    expect(await getActiveSession(env.DB, expired.token)).toBeNull();
  });

  it("revokeAllSessions kills every session for the user", async () => {
    const user = await upsertUserByEmail(env.DB, "c@example.com");
    await createSession(env.DB, user.id, "one");
    const two = await createSession(env.DB, user.id, "two");
    const count = await revokeAllSessions(env.DB, user.id);
    expect(count).toBe(2);
    expect(await getActiveSession(env.DB, two.token)).toBeNull();
  });

  it("does not duplicate a user for the same email", async () => {
    const a = await upsertUserByEmail(env.DB, "d@example.com");
    const b = await upsertUserByEmail(env.DB, "d@example.com");
    expect(a.id).toBe(b.id);
  });
});

describe("magic tokens", () => {
  it("verifies once and rejects reuse", async () => {
    const token = await createMagicToken(env.DB, "e@example.com");
    expect(await consumeMagicToken(env.DB, token)).toBe("e@example.com");
    expect(await consumeMagicToken(env.DB, token)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const token = await createMagicToken(env.DB, "f@example.com", -1);
    expect(await consumeMagicToken(env.DB, token)).toBeNull();
  });
});
