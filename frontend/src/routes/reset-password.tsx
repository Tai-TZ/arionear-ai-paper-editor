import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { AuthAlert, AuthField, AuthShell, AuthSubmitButton } from "@/components/auth/auth-shell";
import { useLocale } from "@/components/locale-provider";
import { isAuthenticated, resetPassword } from "@/lib/auth-store";
import { authPagesCopy } from "@/lib/auth-pages-i18n";
import { authToast } from "@/lib/auth-toast";
import { passwordStrength, validatePassword } from "@/lib/auth-validation";

type ResetSearch = {
  token?: string;
};

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (isAuthenticated()) {
      throw redirect({ to: "/projects" });
    }
    if (!search.token) {
      throw redirect({ to: "/forgot-password" });
    }
  },
  head: () => ({
    meta: [
      { title: "Set New Password — Arionear" },
      { name: "description", content: "Choose a new password for your Arionear account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = useMemo(() => authPagesCopy(locale).resetPassword, [locale]);
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const passwordHint = password ? validatePassword(password) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirm) {
      const message = t.mismatch;
      authToast.resetPasswordError(message);
      setError(message);
      return;
    }

    setLoading(true);
    const result = await resetPassword(token ?? "", password);
    setLoading(false);

    if (!result.ok) {
      authToast.resetPasswordError(result.error);
      setError(result.error);
      return;
    }

    authToast.resetPasswordSuccess();
    setSuccess(result.message);
    setTimeout(() => navigate({ to: "/signin" }), 1500);
  };

  return (
    <AuthShell eyebrow={t.eyebrow} title={t.title} lede={t.lede}>
      {error && <AuthAlert message={error} />}
      {success && (
        <div className="mb-5 border border-foreground/30 bg-background px-4 py-3">
          <p className="font-serif-body text-sm text-foreground">{success}</p>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div>
          <AuthField
            id="password"
            label={t.newPassword}
            icon={<Lock className="h-4 w-4" strokeWidth={1.5} />}
            autoComplete="new-password"
            required
            value={password}
            onChange={setPassword}
            placeholder={t.newPasswordPlaceholder}
            showToggle
            error={passwordHint ?? undefined}
          />
          {password && !passwordHint && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`auth-strength-bar h-1 flex-1 ${
                      i <= strength.score
                        ? `auth-strength-${strength.score}`
                        : "auth-strength-empty"
                    }`}
                  />
                ))}
              </div>
              {strength.label && (
                <span className="font-sans-ui text-[10px] uppercase tracking-widest text-foreground/50">
                  {strength.label}
                </span>
              )}
            </div>
          )}
        </div>

        <AuthField
          id="confirm"
          label={t.confirmPassword}
          icon={<Lock className="h-4 w-4" strokeWidth={1.5} />}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={setConfirm}
          placeholder={t.confirmPlaceholder}
          showToggle
          error={confirm && password !== confirm ? t.mismatch : undefined}
        />

        <AuthSubmitButton loading={loading} disabled={Boolean(success)}>
          {t.updatePassword} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </AuthSubmitButton>
      </form>

      <p className="mt-8 text-center text-sm font-serif-body">
        <Link
          to="/signin"
          className="underline underline-offset-4 font-semibold hover:text-[color:var(--editorial-red)]"
        >
          {t.backToSignIn}
        </Link>
      </p>
    </AuthShell>
  );
}
