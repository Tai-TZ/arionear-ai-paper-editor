import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mail, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { AuthShell, Field } from "./login";

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
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
        >
          <Field
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

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 border border-foreground bg-foreground text-background px-4 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[48px]"
          >
            Send reset link <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </form>
      )}

      <div className="mt-8 flex items-center justify-between font-sans-ui uppercase text-[11px] tracking-widest">
        <Link to="/login" className="inline-flex items-center gap-2 underline underline-offset-4 hover:text-[color:var(--editorial-red)]">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Back to sign in
        </Link>
        <Link to="/register" className="underline underline-offset-4 hover:text-[color:var(--editorial-red)]">
          Create account
        </Link>
      </div>
    </AuthShell>
  );
}