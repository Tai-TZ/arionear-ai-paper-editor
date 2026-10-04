import { Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { useLocale } from "@/components/locale-context";
import { editorShellCopy } from "@/lib/editor-shell-i18n";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type ErrorFallbackCopy = {
  eyebrow: string;
  title: string;
  body: string;
  retry: string;
  back: string;
};

// The root boundary renders outside LocaleProvider, so its copy stays static.
const ROOT_COPY: ErrorFallbackCopy = {
  eyebrow: "Runtime error",
  title: "This page didn't load",
  body: "Something went wrong on our end. You can try again or return home.",
  retry: "Try again",
  back: "Back to home",
};

function ErrorFallbackView({
  error,
  reset,
  copy,
  backTo,
  boundary,
}: {
  error: unknown;
  reset: () => void;
  copy: ErrorFallbackCopy;
  backTo: "/" | "/projects";
  boundary: string;
}) {
  console.error(error);
  const router = useRouter();

  useEffect(() => {
    try {
      reportLovableError(error instanceof Error ? error : new Error(String(error)), {
        boundary,
      });
    } catch {
      // Ignore secondary failures while already in an error boundary.
    }
  }, [error, boundary]);

  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}`.trim()
      : typeof error === "string"
        ? error
        : error
          ? JSON.stringify(error)
          : "";

  return (
    <div className="app-not-found min-h-[100dvh] bg-background text-foreground">
      <div className="app-not-found-masthead flex items-center justify-between border-b border-foreground/15 px-4 py-3 md:px-6">
        <Link to="/" className="font-serif-display text-xl font-black tracking-tighter md:text-2xl">
          Arionear
        </Link>
      </div>
      <main className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-6 py-12 text-center">
        <p className="font-sans-ui text-[11px] uppercase tracking-[0.22em] text-[color:var(--editorial-red)]">
          {copy.eyebrow}
        </p>
        <h1 className="mt-4 font-serif-display text-3xl font-bold tracking-tight md:text-4xl">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-md font-serif-body text-base leading-relaxed text-foreground/70">
          {copy.body}
        </p>
        {detail ? (
          <pre className="mt-6 max-h-40 w-full max-w-lg overflow-auto border border-border bg-card p-3 text-left text-[11px] leading-snug text-muted-foreground">
            {detail}
          </pre>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-[44px] items-center justify-center border border-foreground bg-foreground px-5 py-2.5 font-sans-ui text-[11px] uppercase tracking-[0.16em] text-background transition hover:bg-background hover:text-foreground"
          >
            {copy.retry}
          </button>
          <Link
            to={backTo}
            className="inline-flex min-h-[44px] items-center justify-center border border-foreground/30 px-5 py-2.5 font-sans-ui text-[11px] uppercase tracking-[0.16em] text-foreground transition hover:border-foreground"
          >
            {copy.back}
          </Link>
        </div>
      </main>
    </div>
  );
}

export function AppErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <ErrorFallbackView
      error={error}
      reset={reset}
      copy={ROOT_COPY}
      backTo="/"
      boundary="tanstack_root_error_component"
    />
  );
}

/** `/editor` route boundary: keeps the app shell and offers retry or a way back to projects. */
export function EditorErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
  const { locale } = useLocale();
  return (
    <ErrorFallbackView
      error={error}
      reset={reset}
      copy={editorShellCopy(locale).routeError}
      backTo="/projects"
      boundary="tanstack_editor_error_component"
    />
  );
}
