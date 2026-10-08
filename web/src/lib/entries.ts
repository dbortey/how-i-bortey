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

export function useEntries(query: string, filters: { status?: string; kind?: string } = {}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (filters.status) params.set("status", filters.status);
  if (filters.kind) params.set("kind", filters.kind);
  const qs = params.toString();
  return useQuery({
    queryKey: ["entries", query, filters],
    queryFn: () => api<Entry[]>(qs ? `/entries?${qs}` : "/entries"),
  });
}

export const getEntry = (id: string) => api<Entry & { links: unknown[]; relations: unknown[] }>(`/entries/${id}`);
