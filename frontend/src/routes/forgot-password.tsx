import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mail, ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { AuthAlert, AuthField, AuthShell, AuthSubmitButton } from "@/components/auth/auth-shell";
import { useLocale } from "@/components/locale-context";
import { requestPasswordReset } from "@/lib/auth-store";
import { authPagesCopy } from "@/lib/auth-pages-i18n";
import { authToast } from "@/lib/auth-toast";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Arionear" },
      { name: "description", content: "Request a password reset link for your Arionear account." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { locale } = useLocale();
  const t = useMemo(() => authPagesCopy(locale).forgotPassword, [locale]);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await requestPasswordReset(email);
    setLoading(false);

    if (!result.ok) {
      authToast.forgotPasswordError(result.error);
      setError(result.error);
      return;
    }

    authToast.forgotPasswordSuccess();
    setNotice(result.message);
    setDevResetUrl(result.devResetUrl ?? null);
    setSubmitted(true);
  };

  return (
    <AuthShell eyebrow={t.eyebrow} title={t.title} lede={t.lede}>
      {error && <AuthAlert message={error} />}

      {submitted ? (
        <div className="border border-foreground bg-background p-6">
          <p className="font-sans-ui uppercase text-[11px] tracking-widest text-[color:var(--editorial-red)] mb-3">
            {t.noticePosted}
          </p>
          <h2 className="font-serif-display text-2xl font-bold mb-2">{t.checkInbox}</h2>
          <p className="font-serif-body text-sm text-foreground/70">{notice}</p>
          {devResetUrl && (
            <p className="mt-4 font-serif-body text-xs text-foreground/60 border-t border-foreground/20 pt-4">
              {t.devMode}{" "}
              <a
                href={devResetUrl}
                className="underline break-all hover:text-[color:var(--editorial-red)]"
              >
                {t.openResetLink}
              </a>
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setDevResetUrl(null);
              setNotice("");
            }}
            className="mt-5 font-sans-ui uppercase text-[11px] tracking-widest underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
          >
            {t.useDifferentEmail}
          </button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <AuthField
            id="email"
            label={t.accountEmail}
            icon={<Mail className="h-4 w-4" strokeWidth={1.5} />}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={setEmail}
            placeholder="name@university.edu"
          />

          <AuthSubmitButton loading={loading}>
            {t.sendReset} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </AuthSubmitButton>
        </form>
      )}

      <div className="mt-8 flex items-center justify-between font-sans-ui uppercase text-[11px] tracking-widest">
        <Link
          to="/signin"
          className="inline-flex items-center gap-2 underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> {t.backToSignIn}
        </Link>
        <Link
          to="/signup"
          className="underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
        >
          {t.createAccount}
        </Link>
      </div>
    </AuthShell>
  );
}
