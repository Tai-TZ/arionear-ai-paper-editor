import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mail, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { AuthField, AuthShell, AuthSubmitButton } from "@/components/auth/auth-shell";

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
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <AuthShell
      eyebrow="Errata & Corrections"
      title="Forgot your password?"
      lede="Send us the email on file. We'll mail back a one-time link to set a new one — no questions, no fanfare."
    >
      {submitted ? (
        <div className="border border-foreground bg-background p-6">
          <p className="font-sans-ui uppercase text-[11px] tracking-widest text-[color:var(--editorial-red)] mb-3">
            Notice posted
          </p>
          <h2 className="font-serif-display text-2xl font-bold mb-2">Check your inbox.</h2>
          <p className="font-serif-body text-sm text-foreground/70">
            If <span className="font-semibold">{email}</span> matches an Arionear account, a reset link is on its way. The link expires in 30 minutes.
          </p>
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="mt-5 font-sans-ui uppercase text-[11px] tracking-widest underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <AuthField
            id="email"
            label="Account email"
            icon={<Mail className="h-4 w-4" strokeWidth={1.5} />}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={setEmail}
            placeholder="name@university.edu"
          />

          <AuthSubmitButton loading={loading}>
            Send reset link <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </AuthSubmitButton>
        </form>
      )}

      <div className="mt-8 flex items-center justify-between font-sans-ui uppercase text-[11px] tracking-widest">
        <Link
          to="/signin"
          className="inline-flex items-center gap-2 underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Back to sign in
        </Link>
        <Link to="/signup" className="underline underline-offset-4 hover:text-[color:var(--editorial-red)]">
          Create account
        </Link>
      </div>
    </AuthShell>
  );
}
