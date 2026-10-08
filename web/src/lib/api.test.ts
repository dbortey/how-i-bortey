import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("api", () => {
  it("sends credentials and parses JSON", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ userId: "u1" }), { status: 200 }),
    );
    const me = await api<{ userId: string }>("/me");
    expect(me.userId).toBe("u1");
    expect(spy).toHaveBeenCalledWith("/me", expect.objectContaining({ credentials: "include" }));
  });

  it("throws ApiError with the status on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }));
    await expect(api("/me")).rejects.toBeInstanceOf(ApiError);
  });
});
