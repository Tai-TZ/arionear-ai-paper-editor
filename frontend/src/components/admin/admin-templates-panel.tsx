import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, LayoutTemplate, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { useLocale } from "@/components/locale-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkspacePanelSkeleton } from "@/components/workspace/workspace-content-skeleton";
import { adminCopy } from "@/lib/admin-i18n";
import { TEMPLATE_FORMATS } from "@/lib/template-formats-i18n";
import {
  adminCreateTemplate,
  adminDeleteTemplate,
  adminUpdateTemplate,
  adminUploadTemplatePdf,
  adminUploadTemplatePreview,
  fetchTemplate,
  fetchTemplates,
  templatePreviewUrl,
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

function templateTitle(row: PaperTemplateSummary, locale: "en" | "vi") {
  if (locale === "vi" && row.title_vi?.trim()) return row.title_vi.trim();
  return row.title;
}

function AssetBadge({
  ready,
  label,
  missingLabel,
}: {
  ready: boolean;
  label: string;
  missingLabel: string;
}) {
  return (
    <span className={`admin-template-asset${ready ? " is-ready" : ""}`}>
      {ready ? label : missingLabel}
    </span>
  );
}

export function AdminTemplatesPanel() {
  const { locale } = useLocale();
  const t = useMemo(() => adminCopy(locale), [locale]);
  const tt = t.templates;

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
      .catch((err) => toast.error(err instanceof Error ? err.message : tt.errLoad))
      .finally(() => setLoading(false));
  }, [tt.errLoad]);

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
      toast.error(err instanceof Error ? err.message : tt.errLoadTemplate);
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
      toast.error(tt.errIdRequired);
      return;
    }
    if (!form.title.trim()) {
      toast.error(tt.errTitleRequired);
      return;
    }
    if (!form.main_tex.trim()) {
      toast.error(tt.errLatexRequired);
      return;
    }

    setFormSaving(true);
    try {
      const payload = toPayload(form);
      if (editorMode === "create") {
        await adminCreateTemplate(payload);
        toast.success(tt.toastCreated);
      } else if (originalId) {
        const { id: _id, ...rest } = payload;
        const newId = payload.id;
        await adminUpdateTemplate(originalId, {
          ...rest,
          ...(newId !== originalId ? { new_id: newId } : {}),
        });
        toast.success(tt.toastSaved);
      }
      setEditorOpen(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tt.errSave);
    } finally {
      setFormSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm(tt.confirmDelete(id))) return;
    setBusyId(id);
    try {
      await adminDeleteTemplate(id);
      toast.success(tt.toastDeleted);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tt.errDelete);
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
      toast.success(tt.toastPreviewUploaded);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tt.errUpload);
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
      toast.success(tt.toastPdfUploaded);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tt.errUpload);
    } finally {
      setBusyId(null);
      setUploadTarget(null);
      if (pdfRef.current) pdfRef.current.value = "";
    }
  }

  return (
    <section className="admin-templates-section space-y-5">
      <p className="admin-data-note">{tt.intro}</p>

      <div className="admin-templates-toolbar">
        <p className="admin-templates-count">{tt.count(items.length)}</p>
        <button type="button" className="admin-primary-btn" onClick={openCreate}>
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          {tt.addTemplate}
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
        <WorkspacePanelSkeleton className="py-4" rows={3} label={tt.loading} />
      ) : items.length === 0 ? (
        <div className="admin-empty-state">
          <LayoutTemplate className="h-8 w-8 opacity-30" strokeWidth={1.5} />
          <p className="font-medium">{tt.emptyTitle}</p>
          <p className="text-sm text-muted-foreground">{tt.emptyHint}</p>
        </div>
      ) : (
        <div className="admin-table-wrap admin-templates-table">
          <Table>
            <TableHeader>
              <TableRow className="admin-table-head-row">
                <TableHead className="w-[4.5rem]">{tt.preview}</TableHead>
                <TableHead>{tt.colTemplate}</TableHead>
                <TableHead>{tt.colAssets}</TableHead>
                <TableHead>{tt.colMeta}</TableHead>
                <TableHead className="text-right">{tt.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => {
                const busy = busyId === row.id;
                const title = templateTitle(row, locale);
                const venueLabel = row.venue === "conference" ? tt.conference : tt.journal;

                return (
                  <TableRow key={row.id} className="admin-table-row">
                    <TableCell>
                      {row.has_preview ? (
                        <img
                          src={templatePreviewUrl(row.id)}
                          alt=""
                          className="admin-template-thumb"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="admin-template-thumb admin-template-thumb-placeholder"
                          aria-hidden
                        >
                          <ImageIcon className="h-4 w-4 opacity-40" strokeWidth={1.5} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="admin-template-cell min-w-0">
                        <p className="truncate font-medium">{title}</p>
                        <p className="truncate font-mono-data text-[10px] text-muted-foreground">
                          {row.id}
                        </p>
                        {row.description ? (
                          <p className="admin-template-desc">{row.description}</p>
                        ) : null}
                        {row.tags.length > 0 ? (
                          <div className="admin-template-tags">
                            {row.tags.map((tag) => (
                              <span key={tag} className="admin-template-tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="admin-template-assets">
                        <AssetBadge
                          ready={row.has_preview}
                          label={tt.hasAsset}
                          missingLabel={tt.missingAsset}
                        />
                        <span className="admin-template-asset-label">{tt.preview}</span>
                        <AssetBadge
                          ready={row.has_pdf}
                          label={tt.hasAsset}
                          missingLabel={tt.missingAsset}
                        />
                        <span className="admin-template-asset-label">{tt.pdf}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="admin-template-meta">
                        <span className="admin-badge admin-badge-researcher">
                          {row.format.toUpperCase()}
                        </span>
                        <span className="admin-badge admin-badge-researcher">{venueLabel}</span>
                        {row.is_official ? (
                          <span className="admin-badge admin-badge-god">{tt.official}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="admin-template-actions">
                        <button
                          type="button"
                          className="admin-action-chip"
                          disabled={busy}
                          onClick={() => void openEdit(row.id)}
                        >
                          {tt.edit}
                        </button>
                        <button
                          type="button"
                          className="admin-action-chip"
                          disabled={busy}
                          onClick={() => pickPreview(row.id)}
                        >
                          {tt.uploadPreview}
                        </button>
                        <button
                          type="button"
                          className="admin-action-chip"
                          disabled={busy}
                          onClick={() => pickPdf(row.id)}
                        >
                          <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
                          {tt.uploadPdf}
                        </button>
                        <button
                          type="button"
                          className="admin-action-chip is-danger"
                          disabled={busy}
                          onClick={() => void onDelete(row.id)}
                        >
                          {tt.delete}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editorMode === "create" ? tt.addDialogTitle : tt.editDialogTitle}
            </DialogTitle>
            <DialogDescription>{tt.dialogHint}</DialogDescription>
          </DialogHeader>

          {formLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {tt.loadingTemplate}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="admin-field sm:col-span-1">
                <span className="admin-field-label">{tt.templateId}</span>
                <input
                  className="profile-input font-mono text-sm"
                  value={form.id}
                  onChange={(e) => patchForm("id", e.target.value.toLowerCase())}
                  placeholder="ieee-journal"
                />
              </label>

              <label className="admin-field sm:col-span-1">
                <span className="admin-field-label">{tt.format}</span>
                <select
                  className="profile-input"
                  value={form.format}
                  onChange={(e) => patchForm("format", e.target.value)}
                >
                  {TEMPLATE_FORMATS.map((format) => (
                    <option key={format.value} value={format.value}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">{tt.title}</span>
                <input
                  className="profile-input"
                  value={form.title}
                  onChange={(e) => patchForm("title", e.target.value)}
                  placeholder="IEEE for journals template…"
                />
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">{tt.titleVi}</span>
                <input
                  className="profile-input"
                  value={form.title_vi}
                  onChange={(e) => patchForm("title_vi", e.target.value)}
                />
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">{tt.description}</span>
                <textarea
                  className="profile-input min-h-[72px] resize-y"
                  value={form.description}
                  onChange={(e) => patchForm("description", e.target.value)}
                />
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">{tt.abstract}</span>
                <textarea
                  className="profile-input min-h-[72px] resize-y"
                  value={form.abstract}
                  onChange={(e) => patchForm("abstract", e.target.value)}
                />
              </label>

              <label className="admin-field">
                <span className="admin-field-label">{tt.author}</span>
                <input
                  className="profile-input"
                  value={form.author}
                  onChange={(e) => patchForm("author", e.target.value)}
                />
              </label>

              <label className="admin-field">
                <span className="admin-field-label">{tt.venue}</span>
                <select
                  className="profile-input"
                  value={form.venue}
                  onChange={(e) => patchForm("venue", e.target.value)}
                >
                  <option value="journal">{tt.journal}</option>
                  <option value="conference">{tt.conference}</option>
                </select>
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">{tt.tags}</span>
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
                <span className="text-sm">{tt.officialTemplate}</span>
              </label>

              <label className="admin-field sm:col-span-2">
                <span className="admin-field-label">{tt.latexSource}</span>
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
              className="admin-secondary-btn"
              onClick={() => setEditorOpen(false)}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              className="admin-primary-btn"
              onClick={() => void onSave()}
              disabled={formLoading || formSaving}
            >
              {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editorMode === "create" ? tt.createTemplate : tt.saveChanges}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
