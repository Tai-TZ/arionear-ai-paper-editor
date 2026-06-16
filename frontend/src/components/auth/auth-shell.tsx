import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";

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
    <div className="auth-page min-h-screen bg-background text-foreground grid lg:grid-cols-2">
      <aside className="auth-aside hidden lg:flex flex-col justify-between border-r-4 border-foreground p-12 bg-foreground text-background">
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

export function AuthField({
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
  error,
  showToggle,
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
  error?: string;
  showToggle?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const inputType = showToggle ? (visible ? "text" : "password") : type;

  return (
    <div>
      <label htmlFor={id} className="block font-sans-ui uppercase text-[11px] tracking-widest mb-2">
        {label}
      </label>
      <div
        className={`flex items-center border bg-background transition-colors focus-within:outline focus-within:outline-2 ${
          error
            ? "border-[color:var(--editorial-red)] focus-within:outline-[color:var(--editorial-red)]"
            : "border-foreground focus-within:outline-foreground"
        }`}
      >
        {icon && (
          <span className="px-3 border-r border-foreground/30 text-foreground/60">{icon}</span>
        )}
        <input
          id={id}
          type={inputType}
          required={required}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-3 bg-transparent font-serif-body text-base placeholder:text-foreground/40 focus:outline-none"
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="px-3 text-foreground/50 hover:text-foreground transition"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p className="mt-2 font-serif-body text-xs text-[color:var(--editorial-red)]">{error}</p>
      ) : helper ? (
        <p className="mt-2 font-serif-body text-xs text-foreground/60">{helper}</p>
      ) : null}
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

export function AuthAlert({ message }: { message: string }) {
  return (
    <div className="mb-5 border border-[color:var(--editorial-red)]/40 bg-[color:var(--editorial-red)]/5 px-4 py-3">
      <p className="font-serif-body text-sm text-[color:var(--editorial-red)]">{message}</p>
    </div>
  );
}

export function AuthSubmitButton({
  children,
  loading,
  disabled,
}: {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className="w-full inline-flex items-center justify-center gap-2 border border-foreground bg-foreground text-background px-4 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-foreground disabled:hover:text-background"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          Please wait…
        </>
      ) : (
        children
      )}
    </button>
  );
}
