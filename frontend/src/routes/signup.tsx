import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mail, Lock, User, Building2, ArrowLeft } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import {
  AuthAlert,
  AuthDivider,
  AuthField,
  AuthShell,
  AuthSubmitButton,
} from "@/components/auth/auth-shell";
import { AuthSsoButtons } from "@/components/auth/sso-buttons";
import { useLocale } from "@/components/locale-provider";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { sendSignupVerificationCode, verifySignupCode } from "@/lib/auth-store";
import { authPagesCopy } from "@/lib/auth-pages-i18n";
import { redirectIfAuthenticated } from "@/lib/require-auth";
import { authToast } from "@/lib/auth-toast";
import { passwordStrength } from "@/lib/auth-validation";

export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    redirectIfAuthenticated("/projects");
  },
  head: () => ({
    meta: [
      { title: "Sign Up — Arionear" },
      {
        name: "description",
        content: "Create an Arionear account to start editing your scientific manuscripts.",
      },
    ],
  }),
  component: SignUpPage,
});

type SignupStep = "form" | "verify";

const RESEND_COOLDOWN_SECONDS = 60;

type SignupCopy = ReturnType<typeof authPagesCopy>["signup"];

function localizedPasswordHint(password: string, t: SignupCopy): string | null {
  if (!password) return null;
  if (password.length < 8) return t.passwordTooShort;
  if (new TextEncoder().encode(password).length > 72) return t.passwordTooLong;
  if (!/[A-Za-z]/.test(password)) return t.passwordNeedsLetter;
  if (!/\d/.test(password)) return t.passwordNeedsNumber;
  return null;
}

function localizedPasswordStrength(password: string, t: SignupCopy) {
  const raw = passwordStrength(password);
  const labels = ["", t.strengthWeak, t.strengthFair, t.strengthGood, t.strengthStrong];
  return { score: raw.score, label: labels[raw.score] ?? "" };
}

function SignUpPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = useMemo(() => authPagesCopy(locale).signup, [locale]);
  const [step, setStep] = useState<SignupStep>("form");
  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const strength = useMemo(() => localizedPasswordStrength(password, t), [password, t]);
  const passwordHint = useMemo(() => localizedPasswordHint(password, t), [password, t]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!accepted) {
      const message = t.acceptPolicyError;
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
    setVerificationCode("");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
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
    setVerificationCode("");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const shellProps =
    step === "verify"
      ? {
          eyebrow: t.eyebrowVerify,
          title: t.titleVerify,
          lede: t.ledeVerify(email),
        }
      : {
          eyebrow: t.eyebrowForm,
          title: t.titleForm,
          lede: t.ledeForm,
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
              {t.verificationCode}
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

          <AuthSubmitButton loading={loading} disabled={verificationCode.length !== 6}>
            {t.verifyAndCreate} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </AuthSubmitButton>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 font-sans-ui uppercase text-[11px] tracking-widest">
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setError("");
                setVerificationCode("");
              }}
              className="inline-flex items-center gap-2 underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> {t.backToForm}
            </button>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={loading || resendCooldown > 0}
              className="underline underline-offset-4 hover:text-[color:var(--editorial-red)] disabled:opacity-50"
            >
              {resendCooldown > 0 ? t.resendCooldown(resendCooldown) : t.resendCode}
            </button>
          </div>
        </form>
      ) : (
        <>
          <form className="space-y-5" onSubmit={handleSendCode} noValidate>
            <div className="grid sm:grid-cols-2 gap-5">
              <AuthField
                id="name"
                label={t.fullNameLabel}
                icon={<User className="h-4 w-4" strokeWidth={1.5} />}
                value={name}
                onChange={setName}
                autoComplete="name"
                required
                placeholder={t.fullNamePlaceholder}
              />
              <AuthField
                id="affiliation"
                label={t.affiliationLabel}
                icon={<Building2 className="h-4 w-4" strokeWidth={1.5} />}
                value={affiliation}
                onChange={setAffiliation}
                autoComplete="organization"
                placeholder={t.affiliationPlaceholder}
              />
            </div>

            <AuthField
              id="email"
              label={t.emailLabel}
              icon={<Mail className="h-4 w-4" strokeWidth={1.5} />}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={setEmail}
              placeholder={t.emailPlaceholder}
            />

            <div>
              <AuthField
                id="password"
                label={t.passwordLabel}
                icon={<Lock className="h-4 w-4" strokeWidth={1.5} />}
                autoComplete="new-password"
                required
                value={password}
                onChange={setPassword}
                placeholder={t.passwordPlaceholder}
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

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 border border-foreground accent-foreground"
              />
              <span className="font-serif-body text-sm text-foreground/80">
                {t.integrityPolicy}
              </span>
            </label>

            <AuthSubmitButton loading={loading} disabled={!accepted}>
              {t.continue} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </AuthSubmitButton>
          </form>

          <AuthDivider>{t.dividerGoogle}</AuthDivider>

          <AuthSsoButtons onError={setError} />
        </>
      )}

      <p className="mt-8 text-center text-sm font-serif-body">
        {t.alreadyHave}{" "}
        <Link
          to="/signin"
          className="underline underline-offset-4 font-semibold hover:text-[color:var(--editorial-red)]"
        >
          {t.signIn}
        </Link>
      </p>
    </AuthShell>
  );
}
