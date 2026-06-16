import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, User } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getSession, type AuthUser } from "@/lib/auth-store";
import { editorEntryPath } from "@/lib/require-auth";

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

type FooterLink = {
  label: string;
  to: string;
};

type FooterSection = {
  heading: string;
  links: FooterLink[];
};

const footerSections: FooterSection[] = [
  {
    heading: "Desk",
    links: [
      { label: "Features", to: "/features" },
      { label: "Workflow", to: "/workflow" },
      { label: "Integrity", to: "/integrity" },
    ],
  },
  {
    heading: "Authors",
    links: [
      { label: "Open Editor", to: "/projects" },
      { label: "LaTeX Guide", to: "/latex-guide" },
    ],
  },
  {
    heading: "Bureau",
    links: [
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms", to: "/terms" },
      { label: "Privacy", to: "/privacy" },
      { label: "Ethics", to: "/ethics" },
      { label: "Data Use", to: "/data-use" },
    ],
  },
];

const navLinks = [
  { label: "Features", to: "/features" },
  { label: "Workflow", to: "/workflow" },
  { label: "Integrity", to: "/integrity" },
] as const;

function navLinkClass(active: boolean) {
  return active
    ? "text-[color:var(--editorial-red)]"
    : "text-foreground hover:text-[color:var(--editorial-red)]";
}

export function MarketingTicker() {
  const items = [
    "Closer to publication",
    "AI academic writing & editing assistant",
    "LaTeX upload · edit · compile · preview",
    "Expression support — never invent data or results",
    "For researchers who are not native English speakers",
  ];
  return (
    <div className="bg-foreground text-background border-y border-foreground overflow-hidden">
      <div className="flex whitespace-nowrap animate-[ticker_40s_linear_infinite] py-2 font-mono-data uppercase text-xs tracking-widest">
        {[...items, ...items, ...items].map((t, i) => (
          <span key={i} className="px-6 flex items-center gap-6">
            <span className="inline-block w-1.5 h-1.5 bg-[color:var(--editorial-red)]" />
            {t}
          </span>
        ))}
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-33.333%) } }`}</style>
    </div>
  );
}

export function MarketingMasthead() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [user, setUser] = useState<AuthUser | null>(() =>
    typeof window === "undefined" ? null : getSession(),
  );

  useEffect(() => {
    setUser(getSession());
  }, [pathname]);

  const editorPath = user ? "/projects" : editorEntryPath();

  return (
    <header className="border-b-4 border-foreground bg-background sticky top-0 z-40">
      <div className="max-w-screen-xl mx-auto px-4">
        <div className="flex items-center justify-between border-b border-foreground/30 py-2 text-[11px] font-mono-data uppercase tracking-widest">
          <span>Vol. I · No. 01</span>
          <span className="hidden sm:inline">{today} · International Edition</span>
          {user ? (
            <span className="inline-flex items-center gap-1.5">
              <span>Signed in ·</span>
              <Link
                to="/projects"
                title={user.email}
                className="hover:text-[color:var(--editorial-red)] transition-colors"
              >
                {user.name}
              </Link>
              <User className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden />
            </span>
          ) : (
            <span>Guest · Sign in to save</span>
          )}
        </div>
        <div className="flex items-center justify-between py-5 gap-4">
          <Link to="/" className="font-serif-display text-3xl sm:text-5xl font-black leading-none tracking-tighter">
            Arionear
          </Link>
          <nav className="hidden md:flex items-center gap-8 font-sans-ui uppercase text-xs tracking-widest">
            {navLinks.map(({ label, to }) => (
              <Link key={to} to={to} className={navLinkClass(pathname === to)}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to={editorPath}
              className="inline-flex items-center gap-2 border border-foreground bg-foreground text-background px-4 py-2 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[44px]"
            >
              Open Editor <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

export function MarketingColophon() {
  return (
    <footer className="bg-background border-t border-foreground">
      <div className="max-w-screen-xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-6 gap-8">
        <div className="col-span-2">
          <Link to="/" className="font-serif-display text-3xl font-black tracking-tighter hover:opacity-80">
            Arionear
          </Link>
          <p className="mt-2 font-body italic text-sm">AI Trợ Lý Viết & Biên Tập Bài Báo Khoa Học.</p>
          <p className="mt-4 font-mono-data text-[10px] uppercase tracking-widest text-neutral-600">
            Edition Vol. I · Printed for the web · {new Date().getFullYear()}
          </p>
        </div>
        {footerSections.map((section) => (
          <div key={section.heading}>
            <div className="font-mono-data text-xs uppercase tracking-widest border-b border-foreground pb-2">
              {section.heading}
            </div>
            <ul className="mt-3 space-y-2 font-body text-sm">
              {section.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-foreground">
        <div className="max-w-screen-xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 font-mono-data text-[10px] uppercase tracking-widest">
          <span>© {new Date().getFullYear()} Arionear Editorial Co.</span>
          <span>All the science that&apos;s fit to publish.</span>
        </div>
      </div>
    </footer>
  );
}

type MarketingLayoutProps = {
  children: ReactNode;
  showTicker?: boolean;
};

export function MarketingLayout({ children, showTicker = false }: MarketingLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingMasthead />
      {showTicker ? <MarketingTicker /> : null}
      <main>{children}</main>
      <MarketingColophon />
    </div>
  );
}
