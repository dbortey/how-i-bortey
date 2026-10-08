import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface Entry {
  id: string;
  title: string;
  kind: string;
  status: string;
  verdict: string | null;
  body: string;
  source_url: string | null;
  attributes: Record<string, unknown>;
  tags: string[];
}

export function useEntries(query: string) {
  return useQuery({
    queryKey: ["entries", query],
    queryFn: () => api<Entry[]>(query ? `/entries?q=${encodeURIComponent(query)}` : "/entries"),
  });
}

export const getEntry = (id: string) => api<Entry & { links: unknown[]; relations: unknown[] }>(`/entries/${id}`);
