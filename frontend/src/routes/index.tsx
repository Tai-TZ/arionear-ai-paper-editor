import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { FileText, BookOpen, Quote, MessageSquare, ShieldCheck, GitCompare, ArrowRight, Upload, Check } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arionear — AI Trợ Lý Viết & Biên Tập Bài Báo Khoa Học" },
      { name: "description", content: "AI academic writing assistant for researchers. Improve academic prose, structure, citations and reviewer replies — without inventing data or results." },
      { property: "og:title", content: "Arionear — Closer to Publication" },
      { property: "og:description", content: "Help good research get published. AI as editor, human as author." },
    ],
  }),
  component: Index,
});

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function Masthead() {
  return (
    <header className="border-b-4 border-foreground bg-background sticky top-0 z-40">
      <div className="max-w-screen-xl mx-auto px-4">
        <div className="flex items-center justify-between border-b border-foreground/30 py-2 text-[11px] font-mono-data uppercase tracking-widest">
          <span>Vol. I · No. 01</span>
          <span className="hidden sm:inline">{today} · International Edition</span>
          <span>Price: Free Preview</span>
        </div>
        <div className="flex items-center justify-between py-5 gap-4">
          <Link to="/" className="font-serif-display text-3xl sm:text-5xl font-black leading-none tracking-tighter">
            Arionear
          </Link>
          <nav className="hidden md:flex items-center gap-8 font-sans-ui uppercase text-xs tracking-widest">
            <a href="#features" className="hover:text-[color:var(--editorial-red)]">Features</a>
            <a href="#workflow" className="hover:text-[color:var(--editorial-red)]">Workflow</a>
            <a href="#integrity" className="hover:text-[color:var(--editorial-red)]">Integrity</a>
            <a href="#pricing" className="hover:text-[color:var(--editorial-red)]">Pricing</a>
          </nav>
          <Link
            to="/projects"
            className="inline-flex items-center gap-2 border border-foreground bg-foreground text-background px-4 py-2 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[44px]"
          >
            Open Editor <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Ticker() {
  const items = [
    "Closer to publication",
    "AI trợ lý viết & biên tập học thuật",
    "Văn phong · cấu trúc · trích dẫn · phản hồi phản biện",
    "Hỗ trợ diễn đạt — không bịa dữ liệu hay kết quả",
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

function Hero() {
  return (
    <section className="border-b-4 border-foreground newsprint-texture">
      <div className="max-w-screen-xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-0">
        <div className="lg:col-span-8 lg:border-r border-foreground p-6 lg:p-12">
          <div className="flex items-center gap-3 font-mono-data uppercase text-xs tracking-widest mb-6">
            <span className="bg-[color:var(--editorial-red)] text-background px-2 py-1">Breaking</span>
            <span>Manuscript Desk · Editorial Bureau</span>
          </div>
          <h1 className="font-serif-display font-black leading-[0.88] tracking-tighter text-5xl sm:text-7xl lg:text-[9rem]">
            Research <em className="italic font-serif-display">Deserves</em> a Fair Reading.
          </h1>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-12 gap-6">
            <p className="md:col-span-7 font-body text-lg leading-relaxed text-justify drop-cap">
              Viết bài báo khoa học chất lượng quốc tế là rào cản lớn — đặc biệt với nhà nghiên cứu không phải người bản ngữ tiếng Anh. Arionear là trợ lý AI biên tập học thuật: cải thiện văn phong và ngữ pháp giữ đúng ý gốc, gợi ý cấu trúc từng phần, kiểm tra logic lập luận, định dạng trích dẫn, và soạn phản hồi phản biện — không bao giờ bịa nội dung hay kết quả.
            </p>
            <div className="md:col-span-5 border-l-0 md:border-l border-foreground md:pl-6">
              <div className="font-mono-data uppercase text-[10px] tracking-widest mb-3 pb-2 border-b border-foreground">From the Editor</div>
              <p className="font-body italic text-base leading-relaxed">
                "Nghiên cứu tốt bị từ chối vì cách trình bày — không phải vì chất lượng khoa học. Chúng tôi giúp công trình của bạn được đọc đúng giá trị."
              </p>
              <p className="mt-3 font-sans-ui text-xs uppercase tracking-widest">— The Arionear Desk</p>
            </div>
          </div>
          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Link
              to="/projects"
              className="inline-flex items-center justify-center gap-2 border border-foreground bg-foreground text-background px-6 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[44px]"
            >
              <Upload className="h-4 w-4" strokeWidth={1.5} /> Upload a Manuscript
            </Link>
            <a
              href="#workflow"
              className="inline-flex items-center justify-center gap-2 border border-foreground bg-transparent px-6 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-foreground hover:text-background transition-colors min-h-[44px]"
            >
              See the Workflow
            </a>
          </div>
        </div>
        <aside className="lg:col-span-4 p-6 lg:p-10 flex flex-col justify-between gap-8 bg-background">
          <div className="border border-foreground p-5">
            <div className="font-mono-data uppercase text-[10px] tracking-widest mb-2">Fig. 1.1</div>
            <div
              role="img"
              aria-label="Halftone newsprint placeholder"
              className="aspect-[4/5] w-full grayscale"
              style={{
                backgroundColor: "#E5E5E0",
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, #111 1px, transparent 0)",
                backgroundSize: "6px 6px",
              }}
            />
            <p className="font-body italic text-sm mt-3 leading-snug">
              A peer-review desk in session. AI marks the proofs; the author retains the pen.
            </p>
          </div>
          <div className="grid grid-cols-3 border border-foreground">
            {[
              { k: "1,240+", v: "Manuscripts polished" },
              { k: "37", v: "Journal styles" },
              { k: "0", v: "Fabricated citations" },
            ].map((s, i) => (
              <div key={i} className={`p-4 ${i < 2 ? "border-r border-foreground" : ""}`}>
                <div className="font-mono-data text-2xl font-bold">{s.k}</div>
                <div className="font-sans-ui text-[10px] uppercase tracking-widest mt-1 text-neutral-600">{s.v}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

const features = [
  { icon: BookOpen, title: "Academic Voice", body: "Cải thiện văn phong học thuật và ngữ pháp tiếng Anh, giữ nguyên ý nghĩa và lập luận gốc của tác giả." },
  { icon: FileText, title: "Structure Guide", body: "Gợi ý cấu trúc Abstract, Introduction, Methods, Results, Discussion theo chuẩn tạp chí quốc tế." },
  { icon: GitCompare, title: "Logic & Consistency", body: "Kiểm tra tính nhất quán và logic lập luận xuyên suốt các phần — phát hiện mâu thuẫn và lỗ hổng." },
  { icon: Quote, title: "Citation Format", body: "Hỗ trợ định dạng trích dẫn APA, IEEE, Vancouver, BibTeX — và cảnh báo nguồn không xác minh được." },
  { icon: MessageSquare, title: "Reviewer Replies", body: "Gợi ý cách phản hồi nhận xét phản biện từng điểm, chuyên nghiệp và bám sát kết quả thực tế." },
  { icon: ShieldCheck, title: "Integrity Guard", body: "Guardrail học thuật: hỗ trợ diễn đạt, tuyệt đối không bịa dữ liệu, kết quả hay trích dẫn." },
];

function Features() {
  return (
    <section id="features" className="border-b-4 border-foreground">
      <div className="max-w-screen-xl mx-auto px-4 py-16">
        <div className="flex items-end justify-between border-b border-foreground pb-4 mb-0">
          <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">The Editorial Desk</h2>
          <span className="font-mono-data uppercase text-xs tracking-widest hidden sm:block">Section A · Features</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-l border-foreground">
          {features.map(({ icon: Icon, title, body }, i) => (
            <article
              key={title}
              className={`p-8 border-r border-b border-foreground hover:bg-neutral-100 transition-colors`}
            >
              <div className="flex items-center gap-4 mb-5">
                <div className="h-12 w-12 border border-foreground flex items-center justify-center hover:bg-foreground hover:text-background transition-colors">
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <span className="font-mono-data text-xs uppercase tracking-widest">No. {String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="font-serif-display font-bold text-2xl mb-3">{title}</h3>
              <p className="font-body text-base leading-relaxed text-neutral-700">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  const steps = [
    { n: "01", t: "Upload the Draft", b: "Drop in your DOCX, PDF or LaTeX bundle. We parse structure, figures, equations and references in place." },
    { n: "02", t: "Read the Markup", b: "Suggestions appear inline as tracked changes — language, structure, logic, citations — each tagged with rationale." },
    { n: "03", t: "Accept or Refuse", b: "You remain the author. Approve, edit, or dismiss each change. Nothing reaches your manuscript without consent." },
    { n: "04", t: "Reply to Reviewers", b: "Paste reviewer comments. Receive grounded, professional drafts that cite your own results — never invented ones." },
  ];
  return (
    <section id="workflow" className="bg-foreground text-background border-b-4 border-foreground">
      <div className="max-w-screen-xl mx-auto px-4 py-20">
        <div className="flex items-end justify-between border-b border-background/40 pb-4">
          <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">How the Press Runs</h2>
          <span className="font-mono-data uppercase text-xs tracking-widest hidden sm:block text-neutral-400">Section B · Workflow</span>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-l border-background/40">
          {steps.map((s) => (
            <li key={s.n} className="p-8 border-r border-b border-background/40">
              <div className="font-mono-data text-[color:var(--editorial-red)] text-sm uppercase tracking-widest mb-4">Step {s.n}</div>
              <h3 className="font-serif-display font-bold text-3xl mb-3">{s.t}</h3>
              <p className="font-body text-base leading-relaxed text-neutral-400">{s.b}</p>
            </li>
          ))}
        </ol>
        <div className="text-center mt-10 font-serif-display italic text-neutral-400">✧ ✧ ✧</div>
      </div>
    </section>
  );
}

function Integrity() {
  const items = [
    "AI never invents data, results, or measurements.",
    "Every reference is verified against the manuscript and the source.",
    "Edits preserve the author's argument and scientific meaning.",
    "All suggestions are reviewable, dismissible, and auditable.",
    "Manuscript content is never used to train external models.",
  ];
  return (
    <section id="integrity" className="border-b-4 border-foreground newsprint-texture">
      <div className="max-w-screen-xl mx-auto px-4 py-20 grid grid-cols-1 lg:grid-cols-12 gap-0">
        <div className="lg:col-span-5 lg:border-r border-foreground lg:pr-10 pb-8 lg:pb-0">
          <span className="font-mono-data uppercase text-xs tracking-widest">Editorial Policy</span>
          <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter mt-4">
            AI is the editor. <br />
            <em className="italic">You</em> are the author.
          </h2>
          <p className="font-body text-lg leading-relaxed mt-6 text-justify">
            Arionear treats your manuscript the way a thoughtful editor would — improving how the work is presented without altering what the work claims. The system is hard-wired to refuse fabrication.
          </p>
        </div>
        <ul className="lg:col-span-7 lg:pl-10 divide-y divide-foreground border-t border-foreground lg:border-t-0">
          {items.map((t, i) => (
            <li key={i} className="flex items-start gap-4 py-5">
              <span className="font-mono-data text-xs uppercase tracking-widest mt-1 w-10">§ {String(i + 1).padStart(2, "0")}</span>
              <Check className="h-5 w-5 mt-1 text-[color:var(--editorial-red)]" strokeWidth={2} />
              <p className="font-body text-lg leading-snug">{t}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Pricing() {
  const tiers = [
    { name: "Reader", price: "Free", desc: "For a single short manuscript.", feats: ["1 active document", "Language & grammar pass", "Basic structure check", "Community support"] },
    { name: "Author", price: "$19", desc: "Per researcher, monthly.", feats: ["Unlimited manuscripts", "Citation validation", "Reviewer reply drafts", "DOCX · PDF · LaTeX export"], featured: true },
    { name: "Bureau", price: "Custom", desc: "For labs and journals.", feats: ["Team workspaces", "Journal style packs", "On-prem deployment", "Dedicated editor support"] },
  ];
  return (
    <section id="pricing" className="border-b-4 border-foreground">
      <div className="max-w-screen-xl mx-auto px-4 py-20">
        <div className="flex items-end justify-between border-b border-foreground pb-4">
          <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">Subscriptions</h2>
          <span className="font-mono-data uppercase text-xs tracking-widest hidden sm:block">Section C · Pricing</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 border-l border-foreground">
          {tiers.map((t) => (
            <div key={t.name} className={`p-8 border-r border-b border-foreground ${t.featured ? "bg-foreground text-background" : ""}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-serif-display text-3xl font-bold">{t.name}</h3>
                {t.featured && <span className="bg-[color:var(--editorial-red)] text-background px-2 py-1 font-mono-data text-[10px] uppercase tracking-widest">Picked</span>}
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-serif-display text-5xl font-black">{t.price}</span>
                {t.price !== "Custom" && <span className="font-mono-data text-xs uppercase tracking-widest">/ mo</span>}
              </div>
              <p className={`mt-2 font-body italic ${t.featured ? "text-neutral-400" : "text-neutral-600"}`}>{t.desc}</p>
              <ul className="mt-6 space-y-3 border-t border-dashed border-current/40 pt-5">
                {t.feats.map((f) => (
                  <li key={f} className="flex items-start gap-3 font-body text-sm leading-relaxed">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--editorial-red)]" strokeWidth={2} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/projects"
                className={`mt-8 inline-flex w-full items-center justify-center gap-2 border px-4 py-3 font-sans-ui uppercase text-xs tracking-widest transition-colors min-h-[44px] ${
                  t.featured
                    ? "border-background bg-background text-foreground hover:bg-transparent hover:text-background"
                    : "border-foreground bg-transparent hover:bg-foreground hover:text-background"
                }`}
              >
                Choose {t.name}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Colophon() {
  return (
    <footer className="bg-background border-t border-foreground">
      <div className="max-w-screen-xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-6 gap-8">
        <div className="col-span-2">
          <div className="font-serif-display text-3xl font-black tracking-tighter">Arionear</div>
          <p className="mt-2 font-body italic text-sm">AI Trợ Lý Viết & Biên Tập Bài Báo Khoa Học.</p>
          <p className="mt-4 font-mono-data text-[10px] uppercase tracking-widest text-neutral-600">
            Edition Vol. I · Printed for the web · {new Date().getFullYear()}
          </p>
        </div>
        {[
          { h: "Desk", l: ["Features", "Workflow", "Integrity", "Pricing"] },
          { h: "Authors", l: ["Open Editor", "DOCX Guide", "LaTeX Guide", "Reviewer Replies"] },
          { h: "Bureau", l: ["About", "Contact", "Careers", "Press"] },
          { h: "Legal", l: ["Terms", "Privacy", "Ethics", "Data Use"] },
        ].map((c) => (
          <div key={c.h}>
            <div className="font-mono-data text-xs uppercase tracking-widest border-b border-foreground pb-2">{c.h}</div>
            <ul className="mt-3 space-y-2 font-body text-sm">
              {c.l.map((x) => (
                <li key={x}><a href="#" className="hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4">{x}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-foreground">
        <div className="max-w-screen-xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 font-mono-data text-[10px] uppercase tracking-widest">
          <span>© {new Date().getFullYear()} Arionear Editorial Co.</span>
          <span>All the science that's fit to publish.</span>
        </div>
      </div>
    </footer>
  );
}

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Masthead />
      <Ticker />
      <main>
        <Hero />
        <Features />
        <Workflow />
        <Integrity />
        <Pricing />
      </main>
      <Colophon />
    </div>
  );
}
