import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { AuthDisabledAccount, AuthShell } from "@/components/auth/auth-shell";
import { useLocale } from "@/components/locale-context";
import { authPagesCopy } from "@/lib/auth-pages-i18n";
import { toast } from "sonner";
import { completeOAuthSession, isAuthenticated } from "@/lib/auth-store";

type GoogleCallbackSearch = {
  access_token?: string;
  return_to?: string;
  error?: string;
  error_code?: string;
};

function localizeOAuthError(
  message: string,
  t: ReturnType<typeof authPagesCopy>["googleCallback"],
): string {
  const lower = message.toLowerCase();
  if (lower.includes("could not complete google sign-in")) return t.couldNotComplete;
  if (lower.includes("cancelled") || lower.includes("canceled")) return t.cancelled;
  if (lower.includes("expired")) return t.expired;
  return message;
}

export const Route = createFileRoute("/auth/google/callback")({
  validateSearch: (search: Record<string, unknown>): GoogleCallbackSearch => ({
    access_token: typeof search.access_token === "string" ? search.access_token : undefined,
    return_to: typeof search.return_to === "string" ? search.return_to : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    error_code: typeof search.error_code === "string" ? search.error_code : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (isAuthenticated() && !search.error && !search.access_token) {
      throw redirect({ to: "/projects" });
    }
  },
  head: () => ({
    meta: [{ title: "Signing in — Proofline" }],
  }),
  component: GoogleCallbackPage,
});

function safeReturnTo(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/projects";
  }
  return value;
}

function GoogleCallbackPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = useMemo(() => authPagesCopy(locale).googleCallback, [locale]);
  const { access_token, return_to, error, error_code } = Route.useSearch();
  const [message, setMessage] = useState(t.completing);
  const [showDisabled, setShowDisabled] = useState(error_code === "account_disabled");

  useEffect(() => {
    if (showDisabled) {
      return;
    }

    let cancelled = false;

    async function finish() {
      const destination = safeReturnTo(return_to);

      if (error) {
        const localized = localizeOAuthError(error, t);
        setMessage(localized);
        toast.error(t.signInFailed, { description: localized });
        return;
      }

      if (!access_token) {
        setMessage(t.noSession);
        toast.error(t.signInFailed, { description: t.noSession });
        return;
      }

      const result = await completeOAuthSession(access_token);
      if (cancelled) return;

      if (!result.ok) {
        const localized = localizeOAuthError(result.error, t);
        setMessage(localized);
        toast.error(t.signInFailed, { description: localized });
        return;
      }

      toast.success(t.signInSuccess, {
        description: result.user.name ? t.welcomeBack(result.user.name) : undefined,
      });
      navigate({ to: destination, replace: true });
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [access_token, error, locale, navigate, return_to, showDisabled, t]);

  if (showDisabled) {
    return (
      <AuthShell eyebrow={t.eyebrow} title={t.title} lede={t.lede}>
        <AuthDisabledAccount
          onUseAnotherAccount={() => navigate({ to: "/signin", replace: true })}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={t.eyebrow} title={t.title} lede={t.lede}>
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        {!error && access_token ? (
          <AppLoadingScreen variant="inline" className="min-h-0 py-0" />
        ) : null}
        <p className="font-serif-body text-sm text-foreground/80 max-w-sm">{message}</p>
        {error || !access_token ? (
          <Link
            to="/signin"
            className="font-sans-ui uppercase text-xs tracking-widest underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
          >
            {t.backToSignIn}
          </Link>
        ) : null}
      </div>
    </AuthShell>
  );
}
