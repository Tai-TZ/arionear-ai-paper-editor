import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useLocale } from "@/components/locale-context";
import { useTemplatesLayoutVariant } from "@/components/templates/template-gallery-layout";
import {
  TemplateBackLink,
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
import { ProjectFormatNoticeDialog } from "@/components/projects/project-format-notice-dialog";
import { useProjectFormatNotice } from "@/components/projects/project-format-notice";

export const Route = createFileRoute("/templates/$templateId/")({
  ssr: false,
  component: TemplateDetailPage,
});

function TemplateDetailFrame({ children }: { children: ReactNode }) {
  const variant = useTemplatesLayoutVariant();

  if (variant === "workspace") {
    return (
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="projects-desk soft-scrollbar flex-1 overflow-y-auto">
          <div className="projects-desk-inner template-detail-page">{children}</div>
        </div>
      </main>
    );
  }

  return (
    <article className="border-b-4 border-foreground newsprint-texture">
      <div className="template-gallery-marketing template-detail-page mx-auto max-w-4xl px-4 py-12 lg:py-16">
        {children}
      </div>
    </article>
  );
}

function TemplateDetailPage() {
  const { templateId } = Route.useParams();
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = useMemo(() => templatesCopy(locale), [locale]);
  const [item, setItem] = useState<PaperTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    open: formatNoticeOpen,
    runWithNotice,
    confirm: confirmFormatNotice,
    dismiss: dismissFormatNotice,
  } = useProjectFormatNotice();

  const openProject = useCallback(async () => {
    setOpening(true);
    try {
      const { paper_id } = await openTemplateAsProject(templateId);
      navigate({ to: "/editor", search: { projectId: paper_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open template.");
    } finally {
      setOpening(false);
    }
  }, [navigate, templateId]);

  const onOpen = useCallback(() => {
    if (!getSession()) {
      toast.message(t.signInToOpen);
      navigate({ to: editorEntryPath() });
      return;
    }
    runWithNotice(() => void openProject());
  }, [navigate, openProject, runWithNotice, t.signInToOpen]);

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

  if (loading) {
    return (
      <TemplateDetailFrame>
        <div className="template-gallery-state">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t.loading}
        </div>
      </TemplateDetailFrame>
    );
  }

  if (error || !item) {
    return (
      <TemplateDetailFrame>
        <TemplateBackLink to="/templates" label={t.backToGallery} />
        <p className="template-gallery-state template-gallery-state-error">
          {error ?? "Not found"}
        </p>
      </TemplateDetailFrame>
    );
  }

  const title = locale === "vi" && item.title_vi ? item.title_vi : item.title;
  const abstract = locale === "vi" && item.abstract_vi ? item.abstract_vi : item.abstract;
  const updated = item.updated_at
    ? new Date(item.updated_at).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US")
    : "—";

  return (
    <>
      <TemplateDetailFrame>
        <TemplateBackLink to="/templates" label={t.backToGallery} />

        <div className="template-detail-grid">
          <div>
            <h1 className="template-detail-title">
              {title}
              {item.is_official ? <TemplateOfficialBadge label={t.official} /> : null}
            </h1>

            <div className="template-detail-actions">
              <button
                type="button"
                onClick={onOpen}
                disabled={opening}
                className="template-detail-primary-btn"
              >
                {opening ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {opening ? t.opening : t.openAsTemplate}
              </button>
              {item.has_pdf ? (
                <Link
                  to="/templates/$templateId/pdf"
                  params={{ templateId }}
                  className="template-detail-secondary-btn"
                >
                  {t.viewPdf}
                </Link>
              ) : null}
            </div>

            <dl className="template-detail-meta">
              <div>
                <dt>{t.author}</dt>
                <dd>{item.author}</dd>
              </div>
              <div>
                <dt>{t.lastUpdated}</dt>
                <dd>{updated}</dd>
              </div>
              <div>
                <dt>{t.license}</dt>
                <dd>{item.license || "—"}</dd>
              </div>
              <div>
                <dt>{t.abstract}</dt>
                <dd className="template-detail-abstract">{abstract}</dd>
              </div>
              <div>
                <dt>{t.tags}</dt>
                <dd>
                  <TemplateTagList tags={item.tags} />
                </dd>
              </div>
            </dl>
          </div>

          <aside className="template-detail-preview">
            {item.has_preview ? (
              <img src={templatePreviewUrl(item.id)} alt="" />
            ) : (
              <div className="template-catalog-cover-placeholder template-detail-preview-empty">
                Preview
              </div>
            )}
          </aside>
        </div>
      </TemplateDetailFrame>

      <ProjectFormatNoticeDialog
        open={formatNoticeOpen}
        onConfirm={confirmFormatNotice}
        onOpenChange={(next) => {
          if (!next) dismissFormatNotice();
        }}
      />
    </>
  );
}
