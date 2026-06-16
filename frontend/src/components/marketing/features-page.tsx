import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  FileText,
  GitCompare,
  Quote,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { MarketingLayout } from "./marketing-layout";
import { featuresContent } from "@/lib/marketing-content";

const features = [
  {
    icon: BookOpen,
    n: "01",
    title: "Academic Voice",
    body: "Improve academic English while preserving meaning.",
    angle: 0,
  },
  {
    icon: FileText,
    n: "02",
    title: "Structure Guide",
    body: "IMRAD sections — abstract through discussion.",
    angle: 72,
  },
  {
    icon: GitCompare,
    n: "03",
    title: "Logic & Consistency",
    body: "Cross-section argument coherence checks.",
    angle: 144,
  },
  {
    icon: Quote,
    n: "04",
    title: "Citation Format",
    body: "APA, IEEE, Vancouver, BibTeX support.",
    angle: 216,
  },
  {
    icon: ShieldCheck,
    n: "05",
    title: "Integrity Guard",
    body: "No fabricated data, results, or citations.",
    angle: 288,
  },
];

function FeaturesHubDiagram() {
  const cx = 200;
  const cy = 200;
  const radius = 130;

  return (
    <div className="border border-foreground bg-background p-4 sm:p-8">
      <div className="flex flex-col lg:flex-row gap-8 items-center">
        {/* radial diagram */}
        <div className="w-full lg:w-1/2 flex justify-center">
          <svg
            viewBox="0 0 400 400"
            className="w-full max-w-[400px] h-auto"
            role="img"
            aria-label="Feature hub diagram showing five editorial capabilities around a central LaTeX manuscript"
          >
            {/* outer ring */}
            <circle cx={cx} cy={cy} r={radius + 40} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-foreground/25" />
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground/40" />

            {/* spokes + nodes */}
            {features.map((f) => {
              const rad = ((f.angle - 90) * Math.PI) / 180;
              const nx = cx + radius * Math.cos(rad);
              const ny = cy + radius * Math.sin(rad);
              return (
                <g key={f.n}>
                  <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="currentColor" strokeWidth="1.5" className="text-foreground/30" />
                  <circle cx={nx} cy={ny} r="28" fill="var(--newsprint, #F9F7F2)" stroke="currentColor" strokeWidth="2" className="text-foreground" />
                  <text
                    x={nx}
                    y={ny - 4}
                    textAnchor="middle"
                    style={{ fontFamily: "ui-monospace, monospace", fontSize: "8px", letterSpacing: "0.08em" }}
                    className="fill-[color:var(--editorial-red)] uppercase"
                  >
                    {f.n}
                  </text>
                  <text
                    x={nx}
                    y={ny + 10}
                    textAnchor="middle"
                    style={{ fontFamily: "'Playfair Display', serif", fontSize: "8px", fontWeight: 700 }}
                    className="fill-current"
                  >
                    {f.title.split(" ")[0]}
                  </text>
                </g>
              );
            })}

            {/* center hub */}
            <rect x={cx - 55} y={cy - 40} width={110} height={80} fill="var(--foreground)" className="text-foreground" />
            <text
              x={cx}
              y={cy - 12}
              textAnchor="middle"
              fill="var(--newsprint, #F9F7F2)"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: "9px", letterSpacing: "0.12em" }}
            >
              MANUSCRIPT
            </text>
            <text
              x={cx}
              y={cy + 8}
              textAnchor="middle"
              fill="var(--newsprint, #F9F7F2)"
              style={{ fontFamily: "'Playfair Display', serif", fontSize: "18px", fontWeight: 900 }}
            >
              LaTeX
            </text>
            <text
              x={cx}
              y={cy + 26}
              textAnchor="middle"
              fill="var(--newsprint, #F9F7F2)"
              style={{ fontFamily: "Georgia, serif", fontSize: "9px", fontStyle: "italic" }}
            >
              .tex source
            </text>
          </svg>
        </div>

        {/* feature cards */}
        <div className="w-full lg:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {features.map(({ icon: Icon, n, title, body }) => (
            <article
              key={n}
              className="border border-foreground p-5 hover:bg-neutral-100/80 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 border border-foreground flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <span className="font-mono-data text-[10px] uppercase tracking-widest text-[color:var(--editorial-red)]">
                  No. {n}
                </span>
              </div>
              <h3 className="font-serif-display font-bold text-xl leading-tight">{title}</h3>
              <p className="font-body text-sm text-neutral-600 mt-2 leading-relaxed">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FeaturesPage() {
  return (
    <MarketingLayout>
      <article className="border-b-4 border-foreground newsprint-texture">
        <div className="max-w-screen-xl mx-auto px-4 py-16 lg:py-20">
          <div className="max-w-3xl">
            <p className="font-mono-data uppercase text-xs tracking-widest text-neutral-600">
              {featuresContent.eyebrow}
            </p>
            <h1 className="mt-3 font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">
              {featuresContent.title}
            </h1>
            <p className="mt-6 font-body text-lg leading-relaxed text-neutral-700">{featuresContent.lede}</p>
          </div>

          <div className="mt-12">
            <div className="flex items-center justify-between border-b border-foreground pb-3 mb-6">
              <span className="font-mono-data uppercase text-xs tracking-widest">Fig. 1.1 · Editorial Hub</span>
              <span className="font-mono-data uppercase text-[10px] tracking-widest text-neutral-500 hidden sm:inline">
                Five capabilities · One manuscript
              </span>
            </div>
            <FeaturesHubDiagram />
          </div>

          <div className="mt-12 pt-8 border-t border-foreground/30 flex flex-wrap gap-6">
            <Link
              to="/"
              className="font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
            >
              ← Back to home
            </Link>
            <Link
              to="/workflow"
              className="inline-flex items-center gap-2 font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)]"
            >
              See workflow <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
