import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  media?: Array<{ id: string; mime: string | null }>;
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

export interface NewEntry {
  title: string;
  kind?: string;
  body?: string;
  tags?: string[];
  source_url?: string;
}

export function useCreateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewEntry) =>
      api<Entry>("/entries", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entries"] }),
  });
}

export function useInbox() {
  return useQuery({ queryKey: ["entries", "inbox"], queryFn: () => api<Entry[]>("/entries?status=inbox") });
}

export function useFileEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Entry>(`/entries/${id}`, { method: "PATCH", body: JSON.stringify({ status: "filed" }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entries"] }),
  });
}

export function useEntry(id: string) {
  return useQuery({ queryKey: ["entry", id], queryFn: () => getEntry(id) });
}

export function useUpdateEntry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api<Entry>(`/entries/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["entry", id] }); qc.invalidateQueries({ queryKey: ["entries"] }); },
  });
}

export function useAddLink(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (link: { url: string; title?: string; kind?: string }) =>
      api(`/entries/${id}/links`, { method: "POST", body: JSON.stringify(link) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entry", id] }),
  });
}

export function useAddRelation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rel: { to_entry: string; type: string; verdict?: string; reason?: string }) =>
      api(`/entries/${id}/relations`, { method: "POST", body: JSON.stringify(rel) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entry", id] }),
  });
}
