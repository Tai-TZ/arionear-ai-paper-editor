const institutions = [
  { abbr: "VNU", name: "Vietnam National University" },
  { abbr: "HCMUS", name: "Univ. of Science · HCMC" },
  { abbr: "HUST", name: "Hanoi Univ. of Science & Tech" },
  { abbr: "UET", name: "Univ. of Engineering & Technology" },
  { abbr: "IEEE", name: "IEEE-style citation workflows" },
  { abbr: "IMRAD", name: "Journal manuscript structure" },
];

export function TrustedBySection() {
  return (
    <section className="border-b-4 border-foreground bg-neutral-50/50 dark:bg-neutral-900/20">
      <div className="max-w-screen-xl mx-auto px-4 py-12 lg:py-14">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 border-b border-foreground/30 pb-6 mb-8">
          <div>
            <p className="font-mono-data uppercase text-xs tracking-widest text-neutral-600">Social proof</p>
            <h2 className="mt-2 font-serif-display font-black text-3xl lg:text-4xl tracking-tighter">
              Trusted by research teams
            </h2>
          </div>
          <p className="font-body text-sm leading-relaxed text-neutral-600 max-w-md lg:text-right">
            Arionear supports LaTeX-first academic writing for university labs and independent researchers preparing
            journal submissions.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {institutions.map((item) => (
            <div
              key={item.abbr}
              className="trusted-by-mark border border-foreground/25 bg-background px-3 py-4 text-center hover:border-foreground transition-colors"
              title={item.name}
            >
              <p className="font-serif-display font-black text-xl tracking-tight">{item.abbr}</p>
              <p className="mt-1 font-mono-data text-[9px] uppercase tracking-widest text-neutral-500 leading-snug">
                {item.name}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-6 font-mono-data text-[10px] uppercase tracking-widest text-neutral-500 text-center">
          Institutional names shown as representative research contexts — not official endorsements.
        </p>
      </div>
    </section>
  );
}
