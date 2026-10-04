import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mail, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import {
  AuthAlert,
  AuthDisabledAccount,
  AuthDivider,
  AuthField,
  AuthShell,
  AuthSubmitButton,
} from "@/components/auth/auth-shell";
import { AuthSsoButtons } from "@/components/auth/sso-buttons";
import { useLocale } from "@/components/locale-provider";
import { loginUser } from "@/lib/auth-store";
import { authPagesCopy } from "@/lib/auth-pages-i18n";
import { defaultAppPath, redirectIfAuthenticated } from "@/lib/require-auth";
import { authToast } from "@/lib/auth-toast";

export const Route = createFileRoute("/signin")({
  beforeLoad: () => {
    redirectIfAuthenticated();
  },
  head: () => ({
    meta: [
      { title: "Sign In — Arionear" },
      { name: "description", content: "Sign in to Arionear to continue editing your manuscript." },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = useMemo(() => authPagesCopy(locale).signin, [locale]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [disabledEmail, setDisabledEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetDisabledState = () => {
    setDisabledEmail(null);
    setError("");
    setEmail("");
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await loginUser(email, password, remember);
    setLoading(false);

    if (!result.ok) {
      if (result.code === "account_disabled") {
        setDisabledEmail(email.trim());
        return;
      }
      authToast.signInError(result.error);
      setError(result.error);
      return;
    }

    authToast.signInSuccess(result.user.name);
    navigate({ to: defaultAppPath(result.user) });
  };

  if (disabledEmail !== null) {
    return (
      <AuthShell eyebrow={t.eyebrow} title={t.title} lede={t.lede}>
        <AuthDisabledAccount email={disabledEmail} onUseAnotherAccount={resetDisabledState} />
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={t.eyebrow} title={t.title} lede={t.lede}>
      {error && <AuthAlert message={error} />}

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <AuthField
          id="email"
          label={t.emailLabel}
          icon={<Mail className="h-4 w-4" strokeWidth={1.5} />}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
          placeholder="name@university.edu"
        />
        <AuthField
          id="password"
          label={t.passwordLabel}
          icon={<Lock className="h-4 w-4" strokeWidth={1.5} />}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          showToggle
        />

        <div className="flex items-center justify-between text-xs font-sans-ui uppercase tracking-widest">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 border border-foreground accent-foreground"
            />
            <span>{t.remember}</span>
          </label>
          <Link
            to="/forgot-password"
            className="underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
          >
            {t.forgot}
          </Link>
        </div>

        <AuthSubmitButton loading={loading}>
          {t.submit} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </AuthSubmitButton>
      </form>

      <AuthDivider>{t.dividerGoogle}</AuthDivider>

      <AuthSsoButtons onError={setError} remember={remember} />

      <p className="mt-8 text-center text-sm font-serif-body">
        {t.newHere}{" "}
        <Link
          to="/signup"
          className="underline underline-offset-4 font-semibold hover:text-[color:var(--editorial-red)]"
        >
          {t.createAccount}
        </Link>
      </p>
    </AuthShell>
  );
}
