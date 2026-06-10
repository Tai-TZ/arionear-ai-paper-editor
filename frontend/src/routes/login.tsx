import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mail, Lock } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Arionear" },
      { name: "description", content: "Sign in to Arionear to continue editing your manuscript." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthShell
      eyebrow="The Reading Room"
      title="Sign in to continue your manuscript."
      lede="Pick up where you left the margins — your drafts, marks and reviewer replies are waiting."
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <Field
          id="email"
          label="Email address"
          icon={<Mail className="h-4 w-4" strokeWidth={1.5} />}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(v) => setEmail(v)}
          placeholder="name@university.edu"
        />
        <Field
          id="password"
          label="Password"
          icon={<Lock className="h-4 w-4" strokeWidth={1.5} />}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(v) => setPassword(v)}
          placeholder="••••••••"
        />

        <div className="flex items-center justify-between text-xs font-sans-ui uppercase tracking-widest">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 border border-foreground accent-foreground" />
            <span>Remember me</span>
          </label>
          <Link to="/forgot-password" className="underline underline-offset-4 hover:text-[color:var(--editorial-red)]">
            Forgot?
          </Link>
        </div>

        <button
          type="submit"
          className="w-full inline-flex items-center justify-center gap-2 border border-foreground bg-foreground text-background px-4 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[48px]"
        >
          Sign in <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </form>

      <AuthDivider>or</AuthDivider>

      <button
        type="button"
        className="w-full border border-foreground bg-background px-4 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-foreground hover:text-background transition-colors min-h-[48px]"
      >
        Continue with institutional SSO
      </button>

      <p className="mt-8 text-center text-sm font-serif-body">
        New to Arionear?{" "}
        <Link to="/register" className="underline underline-offset-4 font-semibold hover:text-[color:var(--editorial-red)]">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

// Shared auth UI primitives (inlined here; re-imported by sibling auth routes)
export function AuthShell({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground grid lg:grid-cols-2">
      {/* Editorial left column */}
      <aside className="hidden lg:flex flex-col justify-between border-r-4 border-foreground p-12 bg-foreground text-background">
        <Link to="/" className="font-serif-display text-4xl font-black tracking-tighter">
          Arionear
        </Link>
        <div>
          <p className="font-sans-ui uppercase text-[11px] tracking-widest opacity-70 mb-4">
            The Editor's Desk
          </p>
          <p className="font-serif-display text-4xl xl:text-5xl leading-[1.05] font-bold">
            “Good writing is rewriting. We just make the second pass faster.”
          </p>
          <p className="mt-6 font-serif-body text-base opacity-80 max-w-md">
            Arionear reads like a copy-editor and questions like a reviewer — never inventing data, always citing the source.
          </p>
        </div>
        <div className="font-mono-data text-[11px] uppercase tracking-widest opacity-60">
          Vol. I · No. 01 · International Edition
        </div>
      </aside>

      {/* Form column */}
      <main className="flex flex-col">
        <header className="lg:hidden border-b-4 border-foreground px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-serif-display text-2xl font-black tracking-tighter">
            Arionear
          </Link>
          <Link to="/" className="font-sans-ui uppercase text-[11px] tracking-widest underline underline-offset-4">
            Back
          </Link>
        </header>

        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <p className="font-sans-ui uppercase text-[11px] tracking-widest text-[color:var(--editorial-red)] mb-3">
              {eyebrow}
            </p>
            <h1 className="font-serif-display text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight">
              {title}
            </h1>
            <p className="mt-4 font-serif-body text-base text-foreground/70 border-l-2 border-foreground pl-4">
              {lede}
            </p>

            <div className="mt-10">{children}</div>
          </div>
        </div>

        <footer className="border-t border-foreground/20 px-6 py-4 font-mono-data text-[11px] uppercase tracking-widest text-foreground/60 flex justify-between">
          <span>© Arionear Press</span>
          <span>Closer to publication</span>
        </footer>
      </main>
    </div>
  );
}

export function Field({
  id,
  label,
  icon,
  type = "text",
  required,
  autoComplete,
  value,
  onChange,
  placeholder,
  helper,
}: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block font-sans-ui uppercase text-[11px] tracking-widest mb-2"
      >
        {label}
      </label>
      <div className="flex items-center border border-foreground bg-background focus-within:outline focus-within:outline-2 focus-within:outline-foreground">
        {icon && (
          <span className="px-3 border-r border-foreground/30 text-foreground/60">{icon}</span>
        )}
        <input
          id={id}
          type={type}
          required={required}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-3 bg-transparent font-serif-body text-base placeholder:text-foreground/40 focus:outline-none"
        />
      </div>
      {helper && (
        <p className="mt-2 font-serif-body text-xs text-foreground/60">{helper}</p>
      )}
    </div>
  );
}

export function AuthDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-4 font-sans-ui uppercase text-[11px] tracking-widest text-foreground/50">
      <div className="flex-1 h-px bg-foreground/30" />
      <span>{children}</span>
      <div className="flex-1 h-px bg-foreground/30" />
    </div>
  );
}