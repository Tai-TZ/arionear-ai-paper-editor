import { Link } from "@tanstack/react-router";
import { MarketingLayout } from "./marketing-layout";
import { aboutContent } from "@/lib/marketing-content";

const teamMembers = [
  { name: "Nguyễn Thành Tài", id: "***" },
  { name: "Nguyễn Trọng Nguyên", id: "***" },
  { name: "Ngô Thị Ánh", id: "***" },
];

function EditorialBoardIllustration() {
  const initials = ["TT", "TN", "NA"];
  return (
    <div className="mt-10 border border-foreground bg-background overflow-hidden">
      <svg
        viewBox="0 0 640 160"
        className="w-full h-auto"
        role="img"
        aria-label="Illustration of the Arionear editorial board — three members at a shared desk"
      >
        {/* desk surface */}
        <rect x="0" y="110" width="640" height="50" fill="var(--foreground)" />
        <line x1="0" y1="110" x2="640" y2="110" stroke="var(--foreground)" strokeWidth="2" />

        {/* newspaper stack left */}
        <rect x="32" y="72" width="48" height="36" fill="none" stroke="var(--foreground)" strokeWidth="1.5" />
        <rect x="38" y="66" width="48" height="36" fill="var(--newsprint, #F9F7F2)" stroke="var(--foreground)" strokeWidth="1.5" />
        <line x1="44" y1="78" x2="78" y2="78" stroke="var(--foreground)" strokeWidth="1" opacity="0.4" />
        <line x1="44" y1="86" x2="72" y2="86" stroke="var(--foreground)" strokeWidth="1" opacity="0.4" />
        <line x1="44" y1="94" x2="76" y2="94" stroke="var(--foreground)" strokeWidth="1" opacity="0.4" />

        {/* three editors */}
        {[120, 280, 440].map((x, i) => (
          <g key={i}>
            {/* chair back */}
            <rect x={x - 28} y="48" width="56" height="62" fill="none" stroke="var(--foreground)" strokeWidth="1.5" rx="2" />
            {/* head */}
            <circle cx={x} cy="36" r="18" fill="var(--newsprint, #F9F7F2)" stroke="var(--foreground)" strokeWidth="1.5" />
            {/* initials badge */}
            <text
              x={x}
              y="41"
              textAnchor="middle"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", fontWeight: 700 }}
              fill="var(--foreground)"
            >
              {initials[i]}
            </text>
            {/* body */}
            <path
              d={`M ${x - 22} 110 L ${x - 16} 72 L ${x + 16} 72 L ${x + 22} 110 Z`}
              fill="var(--newsprint, #F9F7F2)"
              stroke="var(--foreground)"
              strokeWidth="1.5"
            />
            {/* lamp on middle desk */}
            {i === 1 ? (
              <g>
                <line x1={x} y1="20" x2={x} y2="8" stroke="var(--editorial-red, #c0392b)" strokeWidth="2" />
                <path d={`M ${x - 14} 20 Q ${x} 32 ${x + 14} 20 Z`} fill="var(--editorial-red, #c0392b)" opacity="0.9" />
              </g>
            ) : null}
          </g>
        ))}

        {/* shared manuscript center */}
        <rect x="248" y="88" width="144" height="20" fill="var(--newsprint, #F9F7F2)" stroke="var(--foreground)" strokeWidth="1.5" />
        <text
          x="320"
          y="102"
          textAnchor="middle"
          style={{ fontFamily: "'Playfair Display', serif", fontSize: "11px", fontStyle: "italic" }}
          fill="var(--foreground)"
        >
          LaTeX Manuscript
        </text>

        {/* Arionear masthead banner */}
        <rect x="480" y="24" width="128" height="52" fill="none" stroke="var(--foreground)" strokeWidth="1.5" />
        <text
          x="544"
          y="48"
          textAnchor="middle"
          style={{ fontFamily: "'Playfair Display', serif", fontSize: "16px", fontWeight: 900 }}
          fill="var(--foreground)"
        >
          Arionear
        </text>
        <text
          x="544"
          y="66"
          textAnchor="middle"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: "7px", letterSpacing: "0.12em" }}
          fill="var(--foreground)"
          opacity="0.6"
        >
          C2 · APP · 040
        </text>
      </svg>
      <p className="font-body italic text-sm text-neutral-500 px-4 py-3 border-t border-foreground">
        Fig. 3.1 — The editorial board, Arionear.
      </p>
    </div>
  );
}

export function AboutPage() {
  return (
    <MarketingLayout>
      <article className="border-b-4 border-foreground newsprint-texture">
        <div className="max-w-screen-xl mx-auto px-4 py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-0">
            <div className="lg:col-span-5 lg:border-r border-foreground lg:pr-12">
              <p className="font-mono-data uppercase text-xs tracking-widest text-neutral-600">
                {aboutContent.eyebrow}
              </p>
              <h1 className="mt-3 font-serif-display font-black text-4xl lg:text-5xl tracking-tighter leading-[0.95]">
                {aboutContent.title}
              </h1>
              <p className="mt-6 font-body text-lg leading-relaxed text-neutral-700 text-justify">
                {aboutContent.lede}
              </p>
              <div className="mt-8 border border-foreground p-6 bg-background">
                <p className="font-mono-data uppercase text-[10px] tracking-widest text-neutral-500 mb-2">
                  Published by
                </p>
                <p className="font-serif-display font-bold text-xl">Arionear</p>
                <p className="font-body italic text-sm text-neutral-600 mt-1">
                  Arionear · Phase 1 MVP
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 lg:pl-12">
              <div className="flex items-end justify-between border-b border-foreground pb-3 mb-8">
                <h2 className="font-serif-display font-black text-3xl tracking-tighter">The Masthead</h2>
                <span className="font-mono-data uppercase text-[10px] tracking-widest text-neutral-500">
                  {teamMembers.length} members
                </span>
              </div>

              <ul className="divide-y divide-foreground border-t border-foreground">
                {teamMembers.map((member, index) => (
                  <li
                    key={member.id}
                    className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-4 sm:gap-6 items-center py-6 group hover:bg-neutral-100/60 transition-colors px-2 -mx-2"
                  >
                    <span className="font-mono-data text-3xl font-bold text-neutral-300 group-hover:text-[color:var(--editorial-red)] transition-colors w-12">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="font-serif-display font-bold text-2xl tracking-tight">{member.name}</p>
                    <div className="sm:text-right">
                      <span className="inline-block border border-foreground px-3 py-1.5 font-mono-data text-xs tracking-widest bg-background">
                        {member.id}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              <EditorialBoardIllustration />
            </div>
          </div>

          <div className="mt-16 pt-8 border-t border-foreground/30">
            <Link
              to="/"
              className="font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
