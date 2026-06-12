import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mail, Lock, User, Building2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  AuthAlert,
  AuthDivider,
  AuthField,
  AuthShell,
  AuthSubmitButton,
} from "@/components/auth/auth-shell";
import { AuthSsoButtons } from "@/components/auth/sso-buttons";
import { registerUser } from "@/lib/auth-store";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up — Arionear" },
      { name: "description", content: "Create an Arionear account to start editing your scientific manuscripts." },
    ],
  }),
  component: SignUpPage,
});

function passwordStrength(password: string) {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] };
}

function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!accepted) {
      setError("Please accept the editorial integrity policy to continue.");
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));

    const result = registerUser({ name, email, password, affiliation });
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    navigate({ to: "/projects" });
  };

  return (
    <AuthShell
      eyebrow="New Submission"
      title="Create your account."
      lede="Register once. Carry your manuscripts, marks and reviewer correspondence across every revision."
    >
      {error && <AuthAlert message={error} />}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid sm:grid-cols-2 gap-5">
          <AuthField
            id="name"
            label="Full name"
            icon={<User className="h-4 w-4" strokeWidth={1.5} />}
            value={name}
            onChange={setName}
            autoComplete="name"
            required
            placeholder="Dr. Jane Doe"
          />
          <AuthField
            id="affiliation"
            label="Affiliation"
            icon={<Building2 className="h-4 w-4" strokeWidth={1.5} />}
            value={affiliation}
            onChange={setAffiliation}
            autoComplete="organization"
            placeholder="VNU, MIT, …"
          />
        </div>

        <AuthField
          id="email"
          label="Academic email"
          icon={<Mail className="h-4 w-4" strokeWidth={1.5} />}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
          placeholder="name@university.edu"
        />

        <div>
          <AuthField
            id="password"
            label="Password"
            icon={<Lock className="h-4 w-4" strokeWidth={1.5} />}
            autoComplete="new-password"
            required
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            showToggle
          />
          {password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`auth-strength-bar h-1 flex-1 ${
                      i <= strength.score ? `auth-strength-${strength.score}` : "auth-strength-empty"
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

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 border border-foreground accent-foreground"
          />
          <span className="font-serif-body text-sm text-foreground/80">
            I agree to Arionear's editorial integrity policy — AI assists with language and structure; the author remains responsible for the science.
          </span>
        </label>

        <AuthSubmitButton loading={loading} disabled={!accepted}>
          Create account <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </AuthSubmitButton>
      </form>

      <AuthDivider>or continue with</AuthDivider>

      <AuthSsoButtons onError={setError} />

      <p className="mt-8 text-center text-sm font-serif-body">
        Already have an account?{" "}
        <Link
          to="/signin"
          className="underline underline-offset-4 font-semibold hover:text-[color:var(--editorial-red)]"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
