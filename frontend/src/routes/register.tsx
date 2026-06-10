import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mail, Lock, User, Building2 } from "lucide-react";
import { useState } from "react";
import { AuthShell, Field, AuthDivider } from "./login";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create Account — Arionear" },
      { name: "description", content: "Create an Arionear account to start editing your scientific manuscripts." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);

  return (
    <AuthShell
      eyebrow="New Submission"
      title="Open a desk at Arionear."
      lede="Register once. Carry your manuscripts, marks and reviewer correspondence across every revision."
    >
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field
            id="name"
            label="Full name"
            icon={<User className="h-4 w-4" strokeWidth={1.5} />}
            value={name}
            onChange={setName}
            autoComplete="name"
            required
            placeholder="Dr. Jane Doe"
          />
          <Field
            id="affiliation"
            label="Affiliation"
            icon={<Building2 className="h-4 w-4" strokeWidth={1.5} />}
            value={affiliation}
            onChange={setAffiliation}
            autoComplete="organization"
            placeholder="VNU, MIT, …"
          />
        </div>

        <Field
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

        <Field
          id="password"
          label="Password"
          icon={<Lock className="h-4 w-4" strokeWidth={1.5} />}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
          helper="Use a mix of letters, numbers and a symbol or two."
        />

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

        <button
          type="submit"
          disabled={!accepted}
          className="w-full inline-flex items-center justify-center gap-2 border border-foreground bg-foreground text-background px-4 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-foreground disabled:hover:text-background"
        >
          Create account <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </form>

      <AuthDivider>or</AuthDivider>

      <button
        type="button"
        className="w-full border border-foreground bg-background px-4 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-foreground hover:text-background transition-colors min-h-[48px]"
      >
        Continue with ORCID
      </button>

      <p className="mt-8 text-center text-sm font-serif-body">
        Already a contributor?{" "}
        <Link to="/login" className="underline underline-offset-4 font-semibold hover:text-[color:var(--editorial-red)]">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}