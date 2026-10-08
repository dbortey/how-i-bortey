import { QueryClient, useQuery } from "@tanstack/react-query";
import { ApiError, getMe } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2 } },
});

export function useSession() {
  return useQuery({ queryKey: ["me"], queryFn: getMe, retry: false });
}
