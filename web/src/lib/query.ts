import { MutationCache, QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { ApiError, getMe } from "./api";

export function makeQueryClient() {
  const routeUnauthorized = (error: unknown, key: unknown) => {
    if (error instanceof ApiError && error.status === 401 && key !== "me") {
      client.invalidateQueries({ queryKey: ["me"] });
    }
  };
  const queryCache = new QueryCache({
    onError: (error, query) => routeUnauthorized(error, query?.queryKey?.[0]),
  });
  const mutationCache = new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      routeUnauthorized(error, mutation?.options?.mutationKey?.[0]),
  });
  const client = new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: { queries: { retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2 } },
  });
  return client;
}

export const queryClient = makeQueryClient();

export function useSession() {
  return useQuery({ queryKey: ["me"], queryFn: getMe, retry: false });
}
