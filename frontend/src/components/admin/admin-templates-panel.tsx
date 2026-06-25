import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Image as ImageIcon, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminCreateTemplate,
  adminDeleteTemplate,
  adminUpdateTemplate,
  adminUploadTemplatePdf,
  adminUploadTemplatePreview,
  fetchTemplate,
  fetchTemplates,
  type PaperTemplateSummary,
  type TemplateFormPayload,
} from "@/lib/api/templates-api";

const DEFAULT_MAIN_TEX = String.raw`\documentclass[journal]{IEEEtran}

\begin{document}

\title{Your Paper Title}
\author{Author Name}

\maketitle

\begin{abstract}
Your abstract here.
\end{abstract}

\section{Introduction}
Start writing here.

\end{document}
`;

type TemplateFormState = {
  id: string;
  title: string;
  title_vi: string;
  description: string;
  abstract: string;
  author: string;
  tags: string;
  format: string;
  venue: string;
  is_official: boolean;
  main_tex: string;
};

const EMPTY_FORM: TemplateFormState = {
  id: "",
  title: "",
  title_vi: "",
  description: "",
  abstract: "",
  author: "Arionear",
  tags: "IEEE",
  format: "ieee",
  venue: "journal",
  is_official: false,
  main_tex: DEFAULT_MAIN_TEX,
};

function tagsToString(tags: string[]): string {
  return tags.join(", ");
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function toPayload(form: TemplateFormState): TemplateFormPayload {
  return {
    id: form.id.trim().toLowerCase(),
    title: form.title.trim(),
    title_vi: form.title_vi.trim() || undefined,
    description: form.description.trim(),
    abstract: form.abstract.trim(),
    author: form.author.trim() || "Arionear",
    tags: parseTags(form.tags),
    format: form.format,
    venue: form.venue,
    is_official: form.is_official,
    main_tex: form.main_tex,
  };
}

export function AdminTemplatesPanel() {
  const [items, setItems] = useState<PaperTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const previewRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formSaving, setFormSaving] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    fetchTemplates("")
      .then(setItems)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function openCreate() {
    setEditorMode("create");
    setOriginalId(null);
    setForm({ ...EMPTY_FORM, id: "ieee-conference" });
    setEditorOpen(true);
  }

  async function openEdit(id: string) {
    setEditorMode("edit");
    setOriginalId(id);
    setEditorOpen(true);
    setFormLoading(true);
    try {
      const detail = await fetchTemplate(id);
      setForm({
        id: detail.id,
        title: detail.title,
        title_vi: detail.title_vi ?? "",
        description: detail.description,
        abstract: detail.abstract,
        author: detail.author,
        tags: tagsToString(detail.tags),
        format: detail.format,
        venue: detail.venue,
        is_official: detail.is_official,
        main_tex: detail.main_tex ?? DEFAULT_MAIN_TEX,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load template");
      setEditorOpen(false);
    } finally {
      setFormLoading(false);
    }
  }

  function patchForm<K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    if (!form.id.trim()) {
      toast.error("Template ID is required.");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Title is required.");
      return;
    }
    if (!form.main_tex.trim()) {
      toast.error("LaTeX source is required.");
      return;
    }

    setFormSaving(true);
    try {
      const payload = toPayload(form);
      if (editorMode === "create") {
        await adminCreateTemplate(payload);
        toast.success("Template created");
      } else if (originalId) {
        const { id: _id, ...rest } = payload;
        const newId = payload.id;
        await adminUpdateTemplate(originalId, {
          ...rest,
          ...(newId !== originalId ? { new_id: newId } : {}),
        });
        toast.success("Template saved");
      }
      setEditorOpen(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setFormSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm(`Delete template "${id}"?`)) return;
    setBusyId(id);
    try {
      await adminDeleteTemplate(id);
      toast.success("Deleted");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  function pickPreview(id: string) {
    setUploadTarget(id);
    previewRef.current?.click();
  }

  function pickPdf(id: string) {
    setUploadTarget(id);
    pdfRef.current?.click();
  }

  async function onPreviewFile(file: File | undefined) {
    if (!file || !uploadTarget) return;
    setBusyId(uploadTarget);
    try {
      await adminUploadTemplatePreview(uploadTarget, file);
      toast.success("Preview uploaded");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyId(null);
      setUploadTarget(null);
      if (previewRef.current) previewRef.current.value = "";
    }
  }

  async function onPdfFile(file: File | undefined) {
    if (!file || !uploadTarget) return;
    setBusyId(uploadTarget);
    try {
      await adminUploadTemplatePdf(uploadTarget, file);
      toast.success("PDF uploaded");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyId(null);
      setUploadTarget(null);
      if (pdfRef.current) pdfRef.current.value = "";
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Template gallery</h2>
          <p className="text-sm text-muted-foreground">
            Manage LaTeX templates, preview images, and sample PDFs (admin only).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          Add template
        </button>
      </div>

      <input
        ref={previewRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => void onPreviewFile(e.target.files?.[0])}
      />
      <input
        ref={pdfRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => void onPdfFile(e.target.files?.[0])}
      />

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Preview</th>
                <th className="px-3 py-2 font-medium">PDF</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    No templates yet. Click &quot;Add template&quot; to create one.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                    <td className="px-3 py-2">{row.title}</td>
                    <td className="px-3 py-2">{row.has_preview ? "Yes" : "—"}</td>
                    <td className="px-3 py-2">{row.has_pdf ? "Yes" : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          title="Edit template"
                          disabled={busyId === row.id}
                          onClick={() => void openEdit(row.id)}
                          className="rounded border border-border p-1.5 hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Upload preview"
                          disabled={busyId === row.id}
                          onClick={() => pickPreview(row.id)}
                          className="rounded border border-border p-1.5 hover:bg-muted"
                        >
                          <ImageIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Upload PDF"
                          disabled={busyId === row.id}
                          onClick={() => pickPdf(row.id)}
                          className="rounded border border-border p-1.5 hover:bg-muted"
                        >
                          <FileUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          disabled={busyId === row.id}
                          onClick={() => void onDelete(row.id)}
                          className="rounded border border-border p-1.5 text-destructive hover:bg-muted"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editorMode === "create" ? "Add template" : "Edit template"}</DialogTitle>
            <DialogDescription>
              Set metadata and LaTeX source. ID must be a lowercase slug (e.g. ieee-journal).
            </DialogDescription>
          </DialogHeader>

          {formLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading template…
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="admin-field sm:col-span-1">
                <span className="admin-field-label">Template ID</span>
                <input
                  className="profile-input font-mono text-sm"
                  value={form.id}
                  onChange={(e) => patchForm("id", e.target.value.toLowerCase())}
                  placeholder="ieee-journal"
                />
              </label>

              <label className="admin-field sm:col-span-1">
                <span className="admin-field-label">Format</span>
                <select
                  className="profile-input"
                  value={form.format}
                  onChange={(e) => patchForm("format", e.target.value)}
                >
                  <option value="ieee">IEEE</option>
                </select>
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">Title</span>
                <input
                  className="profile-input"
                  value={form.title}
                  onChange={(e) => patchForm("title", e.target.value)}
                  placeholder="IEEE for journals template…"
                />
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">Title (Vietnamese)</span>
                <input
                  className="profile-input"
                  value={form.title_vi}
                  onChange={(e) => patchForm("title_vi", e.target.value)}
                />
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">Description</span>
                <textarea
                  className="profile-input min-h-[72px] resize-y"
                  value={form.description}
                  onChange={(e) => patchForm("description", e.target.value)}
                />
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">Abstract</span>
                <textarea
                  className="profile-input min-h-[72px] resize-y"
                  value={form.abstract}
                  onChange={(e) => patchForm("abstract", e.target.value)}
                />
              </label>

              <label className="admin-field">
                <span className="admin-field-label">Author</span>
                <input
                  className="profile-input"
                  value={form.author}
                  onChange={(e) => patchForm("author", e.target.value)}
                />
              </label>

              <label className="admin-field">
                <span className="admin-field-label">Venue</span>
                <select
                  className="profile-input"
                  value={form.venue}
                  onChange={(e) => patchForm("venue", e.target.value)}
                >
                  <option value="journal">Journal</option>
                  <option value="conference">Conference</option>
                </select>
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">Tags (comma-separated)</span>
                <input
                  className="profile-input"
                  value={form.tags}
                  onChange={(e) => patchForm("tags", e.target.value)}
                  placeholder="IEEE, Journal articles"
                />
              </label>

              <label className="admin-field sm:col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_official}
                  onChange={(e) => patchForm("is_official", e.target.checked)}
                />
                <span className="text-sm">Official template</span>
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">LaTeX source (main.tex)</span>
                <textarea
                  className="profile-input min-h-[280px] resize-y font-mono text-xs leading-relaxed"
                  value={form.main_tex}
                  onChange={(e) => patchForm("main_tex", e.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={formLoading || formSaving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editorMode === "create" ? "Create template" : "Save changes"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
