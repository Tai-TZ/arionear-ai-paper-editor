import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, BookOpen, Quote, ShieldCheck, GitCompare, ArrowRight, Upload, Eye, Lock, PenLine } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { HeroPeerReviewFigure } from "@/components/marketing/hero-figure";
import { editorEntryPath } from "@/lib/require-auth";

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

function Hero() {
  return (
    <section className="border-b-4 border-foreground newsprint-texture">
      <div className="max-w-screen-xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-0">
        <div className="lg:col-span-8 lg:border-r border-foreground p-6 lg:p-12">
          <div className="flex items-center gap-3 font-mono-data uppercase text-xs tracking-widest mb-6">
            <span className="bg-[color:var(--editorial-red)] text-background px-2 py-1">Breaking</span>
            <span>Manuscript Desk · LaTeX Edition</span>
          </div>
          <h1 className="font-serif-display font-black leading-[0.88] tracking-tighter text-5xl sm:text-7xl lg:text-[9rem]">
            Research <em className="italic font-serif-display">Deserves</em> a Fair Reading.
          </h1>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-12 gap-6">
            <p className="md:col-span-7 font-body text-lg leading-relaxed text-justify drop-cap">
              Viết bài báo khoa học chất lượng quốc tế là rào cản lớn — đặc biệt với nhà nghiên cứu không phải người bản ngữ tiếng Anh. Arionear là trợ lý AI biên tập học thuật cho LaTeX: cải thiện văn phong và ngữ pháp giữ đúng ý gốc, gợi ý cấu trúc, kiểm tra trích dẫn — không bao giờ bịa nội dung hay kết quả.
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
              to={editorEntryPath()}
              className="inline-flex items-center justify-center gap-2 border border-foreground bg-foreground text-background px-6 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[44px]"
            >
              <Upload className="h-4 w-4" strokeWidth={1.5} /> Upload LaTeX
            </Link>
            <Link
              to="/workflow"
              className="inline-flex items-center justify-center gap-2 border border-foreground bg-transparent px-6 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-foreground hover:text-background transition-colors min-h-[44px]"
            >
              See the Workflow
            </Link>
          </div>
        </div>
        <aside className="lg:col-span-4 p-6 lg:p-10 flex flex-col justify-between gap-8 bg-background">
          <div className="border border-foreground p-5">
            <div className="font-mono-data uppercase text-[10px] tracking-widest mb-2">Fig. 1.1</div>
            <HeroPeerReviewFigure />
            <p className="font-body italic text-sm mt-3 leading-snug">
              A peer-review desk in session. AI marks the proofs; the author retains the pen.
            </p>
          </div>
          <div className="grid grid-cols-3 border border-foreground">
            {[
              { k: "LaTeX", v: "Upload & edit" },
              { k: "PDF", v: "Compile preview" },
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
  { icon: ShieldCheck, title: "Integrity Guard", body: "Guardrail học thuật: hỗ trợ diễn đạt, tuyệt đối không bịa dữ liệu, kết quả hay trích dẫn." },
];

function Features() {
  return (
    <section id="features" className="border-b-4 border-foreground">
      <div className="max-w-screen-xl mx-auto px-4 py-16">
        <div className="flex items-end justify-between border-b border-foreground pb-4 mb-0">
          <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">The Editorial Desk</h2>
          <Link to="/features" className="font-mono-data uppercase text-xs tracking-widest hidden sm:block hover:text-[color:var(--editorial-red)]">
            Section A · Features →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-l border-foreground">
          {features.map(({ icon: Icon, title, body }, i) => (
            <article key={title} className="p-8 border-r border-b border-foreground hover:bg-neutral-100 transition-colors">
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

function WorkflowTeaser() {
  const steps = [
    { n: "01", t: "Upload LaTeX", b: "Import a `.tex` file and figure assets, or start from a blank or sample project." },
    { n: "02", t: "Read the Markup", b: "Chat with Ario. Suggestions appear as tracked changes with rationale." },
    { n: "03", t: "Accept or Refuse", b: "You remain the author. Nothing reaches your manuscript without consent." },
    { n: "04", t: "Compile PDF", b: "Preview the compiled PDF in the editor and save your LaTeX source." },
  ];
  return (
    <section id="workflow" className="bg-foreground text-background border-b-4 border-foreground">
      <div className="max-w-screen-xl mx-auto px-4 py-20">
        <div className="flex items-end justify-between border-b border-background/40 pb-4">
          <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">How the Press Runs</h2>
          <Link to="/workflow" className="font-mono-data uppercase text-xs tracking-widest hidden sm:block text-neutral-400 hover:text-background">
            Full workflow →
          </Link>
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
        <div className="text-center mt-10">
          <Link
            to="/workflow"
            className="inline-flex items-center gap-2 font-sans-ui uppercase text-xs tracking-widest text-neutral-300 hover:text-background"
          >
            Read the full workflow <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Integrity() {
  const items = [
    {
      icon: ShieldCheck,
      n: "01",
      title: "No Fabrication",
      body: "AI never invents data, results, or measurements.",
    },
    {
      icon: Quote,
      n: "02",
      title: "Verified Citations",
      body: "Every reference is verified against the manuscript and the source.",
    },
    {
      icon: PenLine,
      n: "03",
      title: "Meaning Preserved",
      body: "Edits preserve the author's argument and scientific meaning.",
    },
    {
      icon: Eye,
      n: "04",
      title: "Full Control",
      body: "All suggestions are reviewable, dismissible, and auditable.",
    },
    {
      icon: Lock,
      n: "05",
      title: "Your Data Stays Yours",
      body: "Manuscript content is never used to train external models.",
    },
  ];
  return (
    <section id="integrity" className="border-b-4 border-foreground newsprint-texture">
      <div className="max-w-screen-xl mx-auto px-4 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-0">
          <div className="lg:col-span-5 lg:border-r border-foreground lg:pr-10">
            <span className="font-mono-data uppercase text-xs tracking-widest">Editorial Policy</span>
            <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter mt-4">
              AI is the editor. <br />
              <em className="italic">You</em> are the author.
            </h2>
            <p className="font-body text-lg leading-relaxed mt-6 text-justify">
              Arionear treats your manuscript the way a thoughtful editor would — improving how the work is presented without altering what the work claims. The system is hard-wired to refuse fabrication.
            </p>
            <Link
              to="/integrity"
              className="mt-6 inline-flex font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
            >
              Read editorial policy →
            </Link>
          </div>

          <div className="lg:col-span-7 lg:pl-10">
            <div className="flex items-end justify-between border-b border-foreground pb-3 mb-0">
              <span className="font-mono-data uppercase text-xs tracking-widest">Five Guarantees</span>
              <span className="font-mono-data uppercase text-[10px] tracking-widest text-neutral-500 hidden sm:inline">
                § 01–05
              </span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 border-l border-foreground">
              {items.map(({ icon: Icon, n, title, body }) => (
                <li
                  key={n}
                  className="p-6 border-r border-b border-foreground hover:bg-neutral-100/80 transition-colors group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 border border-foreground flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                      <Icon className="h-4 w-4" strokeWidth={1.5} />
                    </div>
                    <span className="font-mono-data text-[10px] uppercase tracking-widest text-[color:var(--editorial-red)]">
                      § {n}
                    </span>
                  </div>
                  <h3 className="font-serif-display font-bold text-xl leading-tight">{title}</h3>
                  <p className="font-body text-sm text-neutral-600 mt-2 leading-relaxed">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Index() {
  return (
    <MarketingLayout showTicker>
      <Hero />
      <Features />
      <WorkflowTeaser />
      <Integrity />
    </MarketingLayout>
  );
}
