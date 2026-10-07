import { EdicoWordmark } from "@/components/edico-wordmark";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useLocale } from "@/components/locale-context";
import {
  TemplateOfficialBadge,
  TemplateTagList,
} from "@/components/templates/template-gallery-shell";
import {
  fetchTemplates,
  templatePreviewUrl,
  type PaperTemplateSummary,
} from "@/lib/api/templates-api";
import { templatesCopy } from "@/lib/templates-i18n";
import { TEMPLATE_FORMATS, templateEyebrow } from "@/lib/template-formats-i18n";
import { useTemplatesLayoutVariant } from "@/components/templates/template-gallery-layout";

const QUICK_FILTERS: readonly string[] = [
  ...TEMPLATE_FORMATS.map((format) => format.label),
  "Journal",
  "Conference",
  "Thesis",
  "Bibliographies",
];

export function TemplateGalleryContent() {
  const { locale } = useLocale();
  const variant = useTemplatesLayoutVariant();
  const t = useMemo(() => templatesCopy(locale), [locale]);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [items, setItems] = useState<PaperTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTemplates(query, activeTag ?? undefined)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load templates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, activeTag]);

  const featured = items.find((item) => item.featured) ?? items[0] ?? null;
  const gridItems = featured ? items.filter((item) => item.id !== featured.id) : items;

  const resultLabel =
    items.length === 1 ? `1 ${t.resultCountOne}` : `${items.length} ${t.resultCountMany}`;

  const toolbar = (
    <div className="template-catalog-toolbar">
      <div className="template-catalog-search">
        <Search strokeWidth={1.5} />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.search}
        />
      </div>

      <div className="template-catalog-filters" role="group" aria-label={t.filtersTemplates}>
        <button
          type="button"
          className={`template-catalog-filter${activeTag === null && !query ? " is-active" : ""}`}
          onClick={() => {
            setActiveTag(null);
            setSearchInput("");
          }}
        >
          {t.filterAll}
        </button>
        {QUICK_FILTERS.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`template-catalog-filter${activeTag === tag ? " is-active" : ""}`}
            onClick={() => {
              setActiveTag((current) => (current === tag ? null : tag));
              setSearchInput("");
            }}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );

  const meta = (
    <div className="template-catalog-meta">
      <p className="projects-desk-eyebrow">{t.catalogueEyebrow}</p>
      <p className="projects-desk-count">{loading ? "…" : resultLabel}</p>
    </div>
  );

  const body = (
    <div className="template-catalog-body">
      {toolbar}
      {meta}

      {loading ? (
        <div className="template-catalog-state">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t.loading}
        </div>
      ) : error ? (
        <p className="template-catalog-state template-catalog-state-error">{error}</p>
      ) : !items.length ? (
        <div className="template-catalog-empty">
          <h2>{t.noResults}</h2>
          <p>{t.searchPlaceholder}</p>
        </div>
      ) : (
        <>
          {featured ? (
            <TemplateFeaturedCard
              item={featured}
              locale={locale}
              label={t.editorsPick}
              officialLabel={t.official}
              ctaLabel={t.viewTemplate}
            />
          ) : null}
          {gridItems.length ? (
            <ul className="template-catalog-grid">
              {gridItems.map((item) => (
                <TemplateCatalogCard
                  key={item.id}
                  item={item}
                  locale={locale}
                  officialLabel={t.official}
                />
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );

  if (variant === "workspace") {
    return (
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="projects-workspace-header workspace-main-header flex shrink-0 items-center justify-between">
          <div className="projects-header-title">
            <h1>{t.galleryTitle}</h1>
          </div>
        </header>

        <div className="template-catalog-desk soft-scrollbar flex-1 overflow-y-auto">
          <div className="template-catalog-desk-inner">
            <p className="template-catalog-workspace-lede">{t.gallerySubtitle}</p>
            {body}
          </div>
        </div>
      </main>
    );
  }

  return (
    <article className="template-catalog-page">
      <header className="template-catalog-masthead newsprint-texture border-b border-foreground">
        <div className="template-catalog-masthead-inner">
          <div className="template-catalog-masthead-copy">
            <p className="template-catalog-eyebrow">{t.catalogueEyebrow}</p>
            <h1 className="template-catalog-title">{t.galleryTitle}</h1>
            <p className="template-catalog-lede">{t.gallerySubtitle}</p>
          </div>
          <div className="template-catalog-masthead-aside" aria-hidden>
            <span className="template-catalog-aside-label">
              <EdicoWordmark />
            </span>
            <span className="template-catalog-aside-rule" />
            <span className="template-catalog-aside-note">Paper IDE · LaTeX starters</span>
          </div>
        </div>
      </header>

      <div className="template-catalog-desk">
        <div className="template-catalog-desk-inner">{body}</div>
      </div>
    </article>
  );
}

function TemplateFeaturedCard({
  item,
  locale,
  label,
  officialLabel,
  ctaLabel,
}: {
  item: PaperTemplateSummary;
  locale: "en" | "vi";
  label: string;
  officialLabel: string;
  ctaLabel: string;
}) {
  const title = locale === "vi" && item.title_vi ? item.title_vi : item.title;
  const description =
    locale === "vi" && item.description_vi ? item.description_vi : item.description;

  return (
    <Link
      to="/templates/$templateId"
      params={{ templateId: item.id }}
      className="template-catalog-featured"
    >
      <div className="template-catalog-featured-cover">
        {item.has_preview ? (
          <img src={templatePreviewUrl(item.id)} alt="" loading="lazy" />
        ) : (
          <div className="template-catalog-cover-placeholder">Preview</div>
        )}
        <span className="template-catalog-featured-label">{label}</span>
      </div>
      <div className="template-catalog-featured-body">
        <p className="template-catalog-featured-eyebrow">{templateEyebrow(item, locale)}</p>
        <h2 className="template-catalog-featured-title">
          {title}
          {item.is_official ? <TemplateOfficialBadge label={officialLabel} /> : null}
        </h2>
        <p className="template-catalog-featured-desc">{description}</p>
        <span className="template-catalog-featured-cta">
          {ctaLabel} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </span>
      </div>
    </Link>
  );
}

function TemplateCatalogCard({
  item,
  locale,
  officialLabel,
}: {
  item: PaperTemplateSummary;
  locale: "en" | "vi";
  officialLabel: string;
}) {
  const title = locale === "vi" && item.title_vi ? item.title_vi : item.title;
  const description =
    locale === "vi" && item.description_vi ? item.description_vi : item.description;

  return (
    <li>
      <Link
        to="/templates/$templateId"
        params={{ templateId: item.id }}
        className="template-catalog-card"
      >
        <div className="template-catalog-card-cover">
          {item.has_preview ? (
            <img src={templatePreviewUrl(item.id)} alt="" loading="lazy" />
          ) : (
            <div className="template-catalog-cover-placeholder">Preview</div>
          )}
          {item.is_official ? (
            <span className="template-catalog-card-badge">
              <TemplateOfficialBadge label={officialLabel} />
            </span>
          ) : null}
        </div>
        <div className="template-catalog-card-body">
          <p className="template-catalog-card-venue">{templateEyebrow(item, locale)}</p>
          <h2 className="template-catalog-card-title">{title}</h2>
          <p className="template-catalog-card-desc">{description}</p>
          <div className="template-catalog-card-tags">
            <TemplateTagList tags={item.tags.slice(0, 3)} />
          </div>
        </div>
      </Link>
    </li>
  );
}
