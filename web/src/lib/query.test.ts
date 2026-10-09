import { describe, it, expect, vi } from "vitest";
import { makeQueryClient } from "./query";
import { ApiError } from "./api";

describe("queryClient 401 handling", () => {
  it("invalidates the session query when any call returns 401", () => {
    const client = makeQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    client.getQueryCache().config.onError?.(new ApiError(401), { queryKey: ["entries"] } as never);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["me"] });
  });

  it("does not invalidate the session query on non-401 errors", () => {
    const client = makeQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    client.getQueryCache().config.onError?.(new Error("boom"), { queryKey: ["entries"] } as never);
    expect(spy).not.toHaveBeenCalled();
  });

  it("invalidates the session query when a mutation returns 401", () => {
    const client = makeQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    client.getMutationCache().config.onError?.(
      new ApiError(401),
      undefined,
      undefined,
      { options: { mutationKey: ["entries"] } } as never,
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["me"] });
  });

  it("does not invalidate the session query on non-401 mutation errors", () => {
    const client = makeQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    client.getMutationCache().config.onError?.(
      new Error("boom"),
      undefined,
      undefined,
      { options: { mutationKey: ["entries"] } } as never,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
