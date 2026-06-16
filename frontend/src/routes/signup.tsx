import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mail, Lock, User, Building2, ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import {
  AuthAlert,
  AuthDivider,
  AuthField,
  AuthShell,
  AuthSubmitButton,
} from "@/components/auth/auth-shell";
import { AuthSsoButtons } from "@/components/auth/sso-buttons";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { sendSignupVerificationCode, verifySignupCode } from "@/lib/auth-store";
import { redirectIfAuthenticated } from "@/lib/require-auth";
import { authToast } from "@/lib/auth-toast";
import { passwordStrength, validatePassword } from "@/lib/auth-validation";

export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    redirectIfAuthenticated("/projects");
  },
  head: () => ({
    meta: [
      { title: "Sign Up — Arionear" },
      { name: "description", content: "Create an Arionear account to start editing your scientific manuscripts." },
    ],
  }),
  component: SignUpPage,
});

type SignupStep = "form" | "verify";

function SignUpPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<SignupStep>("form");
  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [devVerificationCode, setDevVerificationCode] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const passwordHint = password ? validatePassword(password) : null;

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!accepted) {
      const message = "Please accept the editorial integrity policy to continue.";
      authToast.signUpError(message);
      setError(message);
      return;
    }

    setLoading(true);
    const result = await sendSignupVerificationCode({ name, email, password, affiliation });
    setLoading(false);

    if (!result.ok) {
      authToast.signUpError(result.error);
      setError(result.error);
      return;
    }

    authToast.signUpCodeSent();
    setNotice(result.message);
    setDevVerificationCode(result.devVerificationCode ?? null);
    setVerificationCode("");
    setStep("verify");
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await verifySignupCode(email, verificationCode);
    setLoading(false);

    if (!result.ok) {
      authToast.signUpVerifyError(result.error);
      setError(result.error);
      return;
    }

    authToast.signUpSuccess();
    navigate({ to: "/projects" });
  };

  const handleResendCode = async () => {
    setError("");
    setLoading(true);
    const result = await sendSignupVerificationCode({ name, email, password, affiliation });
    setLoading(false);

    if (!result.ok) {
      authToast.signUpError(result.error);
      setError(result.error);
      return;
    }

    authToast.signUpCodeSent();
    setNotice(result.message);
    setDevVerificationCode(result.devVerificationCode ?? null);
    setVerificationCode("");
  };

  const shellProps =
    step === "verify"
      ? {
          eyebrow: "Proof of address",
          title: "Verify your email.",
          lede: devVerificationCode
            ? `Development mode — no email is sent to ${email}. Enter the code shown below.`
            : `We sent a 6-digit code to ${email}. Enter it below to finish creating your account.`,
        }
      : {
          eyebrow: "New Submission",
          title: "Create your account.",
          lede: "Register once. Carry your manuscripts, marks and reviewer correspondence across every revision.",
        };

  return (
    <AuthShell {...shellProps}>
      {error && <AuthAlert message={error} />}

      {step === "verify" ? (
        <form className="space-y-6" onSubmit={handleVerify} noValidate>
          {notice && (
            <p className="font-serif-body text-sm text-foreground/70 border-l-2 border-foreground/30 pl-4">
              {notice}
            </p>
          )}

          <div>
            <p className="block font-sans-ui uppercase text-[11px] tracking-widest mb-3">
              Verification code
            </p>
            <InputOTP
              maxLength={6}
              value={verificationCode}
              onChange={setVerificationCode}
              containerClassName="justify-center gap-2"
            >
              <InputOTPGroup className="gap-2">
                <InputOTPSlot
                  index={0}
                  className="h-12 w-10 border-foreground rounded-none first:rounded-none last:rounded-none font-serif-display text-lg"
                />
                <InputOTPSlot
                  index={1}
                  className="h-12 w-10 border-foreground rounded-none first:rounded-none last:rounded-none font-serif-display text-lg"
                />
                <InputOTPSlot
                  index={2}
                  className="h-12 w-10 border-foreground rounded-none first:rounded-none last:rounded-none font-serif-display text-lg"
                />
              </InputOTPGroup>
              <InputOTPSeparator className="text-foreground/40" />
              <InputOTPGroup className="gap-2">
                <InputOTPSlot
                  index={3}
                  className="h-12 w-10 border-foreground rounded-none first:rounded-none last:rounded-none font-serif-display text-lg"
                />
                <InputOTPSlot
                  index={4}
                  className="h-12 w-10 border-foreground rounded-none first:rounded-none last:rounded-none font-serif-display text-lg"
                />
                <InputOTPSlot
                  index={5}
                  className="h-12 w-10 border-foreground rounded-none first:rounded-none last:rounded-none font-serif-display text-lg"
                />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {devVerificationCode && (
            <div className="border border-[color:var(--editorial-red)]/40 bg-[color:var(--editorial-red)]/5 px-4 py-4">
              <p className="font-sans-ui uppercase text-[11px] tracking-widest text-[color:var(--editorial-red)] mb-2">
                Development — no email sent
              </p>
              <p className="font-serif-body text-sm text-foreground/80">
                Your verification code is{" "}
                <span className="font-mono-data text-lg tracking-[0.3em] font-semibold">
                  {devVerificationCode}
                </span>
              </p>
            </div>
          )}

          <AuthSubmitButton loading={loading} disabled={verificationCode.length !== 6}>
            Verify & create account <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </AuthSubmitButton>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 font-sans-ui uppercase text-[11px] tracking-widest">
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setError("");
                setVerificationCode("");
                setDevVerificationCode(null);
              }}
              className="inline-flex items-center gap-2 underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Back to form
            </button>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={loading}
              className="underline underline-offset-4 hover:text-[color:var(--editorial-red)] disabled:opacity-50"
            >
              Resend code
            </button>
          </div>
        </form>
      ) : (
        <>
          <form className="space-y-5" onSubmit={handleSendCode} noValidate>
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
                placeholder="At least 8 characters, 1 letter & 1 number"
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
              Continue <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </AuthSubmitButton>
          </form>

          <AuthDivider>or continue with Google</AuthDivider>

          <AuthSsoButtons onError={setError} />
        </>
      )}

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
