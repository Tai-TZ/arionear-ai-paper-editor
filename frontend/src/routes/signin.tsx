import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mail, Lock } from "lucide-react";
import { useState } from "react";
import {
  AuthAlert,
  AuthDisabledAccount,
  AuthDivider,
  AuthField,
  AuthShell,
  AuthSubmitButton,
} from "@/components/auth/auth-shell";
import { AuthSsoButtons } from "@/components/auth/sso-buttons";
import { loginUser } from "@/lib/auth-store";
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
      <AuthShell
        eyebrow="The Reading Room"
        title="Sign in to continue."
        lede="Pick up where you left the margins — your drafts, marks and reviewer replies are waiting."
      >
        <AuthDisabledAccount email={disabledEmail} onUseAnotherAccount={resetDisabledState} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="The Reading Room"
      title="Sign in to continue."
      lede="Pick up where you left the margins — your drafts, marks and reviewer replies are waiting."
    >
      {error && <AuthAlert message={error} />}

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <AuthField
          id="email"
          label="Email address"
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
          label="Password"
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
            <span>Remember me</span>
          </label>
          <Link
            to="/forgot-password"
            className="underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
          >
            Forgot?
          </Link>
        </div>

        <AuthSubmitButton loading={loading}>
          Sign in <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </AuthSubmitButton>
      </form>

      <AuthDivider>or continue with Google</AuthDivider>

      <AuthSsoButtons onError={setError} remember={remember} />

      <p className="mt-8 text-center text-sm font-serif-body">
        New to Arionear?{" "}
        <Link
          to="/signup"
          className="underline underline-offset-4 font-semibold hover:text-[color:var(--editorial-red)]"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
