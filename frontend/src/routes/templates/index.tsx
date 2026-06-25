import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import {
  TemplateGalleryShell,
  TemplateOfficialBadge,
  TemplateTagList,
} from "@/components/templates/template-gallery-shell";
import {
  fetchTemplates,
  templatePreviewUrl,
  type PaperTemplateSummary,
} from "@/lib/api/templates-api";
import { templatesCopy } from "@/lib/templates-i18n";

export const Route = createFileRoute("/templates/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "LaTeX Templates — Arionear" },
      { name: "description", content: "Browse IEEE and academic LaTeX templates for Arionear Paper IDE." },
    ],
  }),
  component: TemplatesGalleryPage,
});

function TemplatesGalleryPage() {
  const { locale } = useLocale();
  const t = useMemo(() => templatesCopy(locale), [locale]);
  const [query, setQuery] = useState("IEEE");
  const [searchInput, setSearchInput] = useState("IEEE");
  const [items, setItems] = useState<PaperTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTemplates(query)
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
  }, [query]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(searchInput.trim());
  }

  return (
    <TemplateGalleryShell>
      <header className="template-gallery-hero mb-8 text-center">
        <p className="mb-2 font-mono-data text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {t.filtersTemplates}
        </p>
        <h1 className="font-serif-display text-4xl font-black tracking-tight sm:text-5xl">{t.galleryTitle}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">{t.gallerySubtitle}</p>
      </header>

      <form onSubmit={onSearch} className="template-gallery-search mx-auto mb-8 flex max-w-2xl gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm outline-none ring-primary focus:ring-2"
          />
        </div>
        <button
          type="submit"
          className="h-11 shrink-0 rounded-md bg-[#3d9a5d] px-5 text-sm font-semibold text-white hover:bg-[#348a52]"
        >
          {t.search}
        </button>
      </form>

      <p className="mb-4 text-right text-xs text-muted-foreground">
        Filters: {t.filtersAll} / {t.filtersTemplates}
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t.loading}
        </div>
      ) : error ? (
        <p className="py-16 text-center text-sm text-destructive">{error}</p>
      ) : !items.length ? (
        <p className="py-16 text-center text-muted-foreground">{t.noResults}</p>
      ) : (
        <ul className="template-gallery-list space-y-0 divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((item) => (
            <TemplateListRow key={item.id} item={item} locale={locale} officialLabel={t.official} />
          ))}
        </ul>
      )}
    </TemplateGalleryShell>
  );
}

function TemplateListRow({
  item,
  locale,
  officialLabel,
}: {
  item: PaperTemplateSummary;
  locale: "en" | "vi";
  officialLabel: string;
}) {
  const title = locale === "vi" && item.title_vi ? item.title_vi : item.title;
  const description = locale === "vi" && item.description_vi ? item.description_vi : item.description;

  return (
    <li>
      <Link
        to="/templates/$templateId"
        params={{ templateId: item.id }}
        className="template-gallery-row flex flex-col gap-4 p-5 transition hover:bg-muted/40 sm:flex-row sm:gap-6"
      >
        <div className="template-gallery-thumb shrink-0 self-start overflow-hidden rounded border border-border bg-white shadow-sm">
          {item.has_preview ? (
            <img
              src={templatePreviewUrl(item.id)}
              alt=""
              className="h-[220px] w-[170px] object-cover object-top"
              loading="lazy"
            />
          ) : (
            <div className="flex h-[220px] w-[170px] items-center justify-center bg-muted text-xs text-muted-foreground">
              Preview
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-[#4b6cb7] hover:underline">
            {title}
            {item.is_official ? <TemplateOfficialBadge label={officialLabel} /> : null}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          <p className="mt-3 text-sm text-foreground/80">{item.author}</p>
          <div className="mt-4">
            <TemplateTagList tags={item.tags} />
          </div>
        </div>
      </Link>
    </li>
  );
}
