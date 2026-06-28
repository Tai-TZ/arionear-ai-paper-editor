import { resolveApiBase } from "./base-url";
import { getAccessToken } from "@/lib/auth-store";
import { mapApiHttpErrorFromResponse } from "./api-errors";

const API_BASE = resolveApiBase();

export type PaperTemplateSummary = {
  id: string;
  slug: string;
  title: string;
  title_vi?: string | null;
  description: string;
  description_vi?: string | null;
  author: string;
  tags: string[];
  is_official: boolean;
  format: string;
  venue: string;
  featured: boolean;
  has_preview: boolean;
  has_pdf: boolean;
  updated_at?: string | null;
};

export type PaperTemplateDetail = PaperTemplateSummary & {
  license: string;
  abstract: string;
  abstract_vi?: string | null;
  created_at?: string | null;
  preview_url?: string | null;
  pdf_url?: string | null;
  main_tex?: string | null;
};

export type TemplateFormPayload = {
  id: string;
  title: string;
  title_vi?: string;
  description?: string;
  description_vi?: string;
  abstract?: string;
  abstract_vi?: string;
  author?: string;
  license?: string;
  tags?: string[];
  is_official?: boolean;
  format?: string;
  venue?: string;
  featured?: boolean;
  main_tex?: string;
};

export type TemplateUpdatePayload = Partial<Omit<TemplateFormPayload, "id">> & {
  new_id?: string;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function templatePreviewUrl(id: string): string {
  return `${API_BASE}/templates/${encodeURIComponent(id)}/preview`;
}

export function templatePdfUrl(id: string): string {
  return `${API_BASE}/templates/${encodeURIComponent(id)}/pdf`;
}

export async function fetchTemplates(query = "", tag?: string): Promise<PaperTemplateSummary[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("query", query.trim());
  if (tag?.trim()) params.set("tag", tag.trim());
  const res = await fetch(`${API_BASE}/templates?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(await mapApiHttpErrorFromResponse(res));
  const body = (await res.json()) as { items: PaperTemplateSummary[] };
  return body.items ?? [];
}

export async function fetchTemplate(id: string): Promise<PaperTemplateDetail> {
  const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await mapApiHttpErrorFromResponse(res));
  return res.json() as Promise<PaperTemplateDetail>;
}

export async function fetchTemplatePdfBytes(id: string): Promise<Uint8Array> {
  const res = await fetch(templatePdfUrl(id), { credentials: "include" });
  if (!res.ok) throw new Error(await mapApiHttpErrorFromResponse(res));
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function openTemplateAsProject(templateId: string): Promise<{ paper_id: string; name: string }> {
  const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(templateId)}/open`, {
    method: "POST",
    headers: { ...authHeaders() },
    credentials: "include",
  });
  if (!res.ok) throw new Error(await mapApiHttpErrorFromResponse(res));
  const body = (await res.json()) as { paper_id: string; name: string };
  return { paper_id: body.paper_id, name: body.name };
}

export async function adminCreateTemplate(payload: TemplateFormPayload): Promise<PaperTemplateDetail> {
  const res = await fetch(`${API_BASE}/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await mapApiHttpErrorFromResponse(res));
  return res.json() as Promise<PaperTemplateDetail>;
}

export async function adminUpdateTemplate(
  id: string,
  payload: TemplateUpdatePayload,
): Promise<PaperTemplateDetail> {
  const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await mapApiHttpErrorFromResponse(res));
  return res.json() as Promise<PaperTemplateDetail>;
}

export async function adminDeleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
    credentials: "include",
  });
  if (!res.ok) throw new Error(await mapApiHttpErrorFromResponse(res));
}

export async function adminUploadTemplatePreview(id: string, file: File): Promise<PaperTemplateDetail> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(id)}/preview`, {
    method: "POST",
    headers: { ...authHeaders() },
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw new Error(await mapApiHttpErrorFromResponse(res));
  return res.json() as Promise<PaperTemplateDetail>;
}

export async function adminUploadTemplatePdf(id: string, file: File): Promise<PaperTemplateDetail> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(id)}/pdf`, {
    method: "POST",
    headers: { ...authHeaders() },
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw new Error(await mapApiHttpErrorFromResponse(res));
  return res.json() as Promise<PaperTemplateDetail>;
}
