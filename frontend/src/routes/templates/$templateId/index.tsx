import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useLocale } from "@/components/locale-provider";
import {
  TemplateBackLink,
  TemplateGalleryShell,
  TemplateOfficialBadge,
  TemplateTagList,
} from "@/components/templates/template-gallery-shell";
import {
  fetchTemplate,
  openTemplateAsProject,
  templatePreviewUrl,
  type PaperTemplateDetail,
} from "@/lib/api/templates-api";
import { getSession } from "@/lib/auth-store";
import { editorEntryPath } from "@/lib/require-auth";
import { templatesCopy } from "@/lib/templates-i18n";
import { markEditorEntryTransition } from "@/components/editor-entry-splash";

export const Route = createFileRoute("/templates/$templateId/")({
  ssr: false,
  component: TemplateDetailPage,
});

function TemplateDetailPage() {
  const { templateId } = Route.useParams();
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = useMemo(() => templatesCopy(locale), [locale]);
  const [item, setItem] = useState<PaperTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTemplate(templateId)
      .then((row) => {
        if (!cancelled) setItem(row);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Template not found.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const onOpen = useCallback(async () => {
    if (!getSession()) {
      toast.message(t.signInToOpen);
      navigate({ to: editorEntryPath() });
      return;
    }
    setOpening(true);
    try {
      const { paper_id } = await openTemplateAsProject(templateId);
      markEditorEntryTransition();
      navigate({ to: "/editor", search: { projectId: paper_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open template.");
    } finally {
      setOpening(false);
    }
  }, [navigate, t.signInToOpen, templateId]);

  if (loading) {
    return (
      <TemplateGalleryShell>
        <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t.loading}
        </div>
      </TemplateGalleryShell>
    );
  }

  if (error || !item) {
    return (
      <TemplateGalleryShell>
        <TemplateBackLink to="/templates" label={t.backToGallery} />
        <p className="text-destructive">{error ?? "Not found"}</p>
      </TemplateGalleryShell>
    );
  }

  const title = locale === "vi" && item.title_vi ? item.title_vi : item.title;
  const abstract = locale === "vi" && item.abstract_vi ? item.abstract_vi : item.abstract;
  const updated = item.updated_at
    ? new Date(item.updated_at).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US")
    : "—";

  return (
    <TemplateGalleryShell>
      <TemplateBackLink to="/templates" label={t.backToGallery} />

      <div className="template-detail-grid grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h1 className="text-2xl font-bold leading-snug sm:text-3xl">
            {title}
            {item.is_official ? <TemplateOfficialBadge label={t.official} /> : null}
          </h1>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onOpen}
              disabled={opening}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#3d9a5d] px-4 text-sm font-semibold text-white hover:bg-[#348a52] disabled:opacity-60"
            >
              {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {opening ? t.opening : t.openAsTemplate}
            </button>
            {item.has_pdf ? (
              <Link
                to="/templates/$templateId/pdf"
                params={{ templateId }}
                className="inline-flex h-10 items-center rounded-md border border-foreground/20 bg-background px-4 text-sm font-medium hover:bg-muted"
              >
                {t.viewPdf}
              </Link>
            ) : null}
          </div>

          <dl className="mt-8 space-y-4 text-sm">
            <div>
              <dt className="font-semibold">{t.author}</dt>
              <dd className="mt-1 text-muted-foreground">{item.author}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t.lastUpdated}</dt>
              <dd className="mt-1 text-muted-foreground">{updated}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t.license}</dt>
              <dd className="mt-1 text-muted-foreground">{item.license || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t.abstract}</dt>
              <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-muted-foreground">{abstract}</dd>
            </div>
            <div>
              <dt className="mb-2 font-semibold">{t.tags}</dt>
              <dd>
                <TemplateTagList tags={item.tags} />
              </dd>
            </div>
          </dl>
        </div>

        <aside className="template-detail-preview">
          {item.has_preview ? (
            <img
              src={templatePreviewUrl(item.id)}
              alt=""
              className="w-full rounded border border-border bg-white shadow-md"
            />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center rounded border border-dashed border-border bg-muted text-sm text-muted-foreground">
              Preview
            </div>
          )}
        </aside>
      </div>
    </TemplateGalleryShell>
  );
}
