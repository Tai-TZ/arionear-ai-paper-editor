import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthDisabledAccount, AuthShell } from "@/components/auth/auth-shell";
import { authToast } from "@/lib/auth-toast";
import { completeOAuthSession, isAuthenticated } from "@/lib/auth-store";

type GoogleCallbackSearch = {
  access_token?: string;
  return_to?: string;
  error?: string;
  error_code?: string;
};

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
    meta: [{ title: "Signing in — Arionear" }],
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
  const { access_token, return_to, error, error_code } = Route.useSearch();
  const [message, setMessage] = useState("Completing Google sign-in…");
  const [showDisabled, setShowDisabled] = useState(error_code === "account_disabled");

  useEffect(() => {
    if (showDisabled) {
      return;
    }

    let cancelled = false;

    async function finish() {
      const destination = safeReturnTo(return_to);

      if (error) {
        setMessage(error);
        authToast.signInError(error);
        return;
      }

      if (!access_token) {
        const msg = "Google sign-in did not return a session. Please try again.";
        setMessage(msg);
        authToast.signInError(msg);
        return;
      }

      const result = await completeOAuthSession(access_token);
      if (cancelled) return;

      if (!result.ok) {
        setMessage(result.error);
        authToast.signInError(result.error);
        return;
      }

      authToast.signInSuccess(result.user.name);
      navigate({ to: destination, replace: true });
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [access_token, error, navigate, return_to, showDisabled]);

  if (showDisabled) {
    return (
      <AuthShell
        eyebrow="Single Sign-On"
        title="One moment."
        lede="We are verifying your Google account and opening your editorial desk."
      >
        <AuthDisabledAccount onUseAnotherAccount={() => navigate({ to: "/signin", replace: true })} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Single Sign-On"
      title="One moment."
      lede="We are verifying your Google account and opening your editorial desk."
    >
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        {!error && access_token ? (
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--editorial-red)]" aria-hidden="true" />
        ) : null}
        <p className="font-serif-body text-sm text-foreground/80 max-w-sm">{message}</p>
        {error || !access_token ? (
          <Link
            to="/signin"
            className="font-sans-ui uppercase text-xs tracking-widest underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
          >
            Back to sign in
          </Link>
        ) : null}
      </div>
    </AuthShell>
  );
}
