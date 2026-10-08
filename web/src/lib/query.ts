import { QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { ApiError, getMe } from "./api";

export function makeQueryClient() {
  const queryCache = new QueryCache({
    onError: (error, query) => {
      if (error instanceof ApiError && error.status === 401 && query?.queryKey?.[0] !== "me") {
        client.invalidateQueries({ queryKey: ["me"] });
      }
    },
  });
  const client = new QueryClient({
    queryCache,
    defaultOptions: { queries: { retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2 } },
  });
  return client;
}

export const queryClient = makeQueryClient();

export function useSession() {
  return useQuery({ queryKey: ["me"], queryFn: getMe, retry: false });
}
