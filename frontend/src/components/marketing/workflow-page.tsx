import { Link } from "@tanstack/react-router";
import {
  Upload,
  MessageSquare,
  GitCompare,
  FileOutput,
  ArrowRight,
  User,
  ShieldCheck,
} from "lucide-react";
import { MarketingLayout } from "./marketing-layout";
import { workflowContent } from "@/lib/marketing-content";

const steps = [
  {
    n: "01",
    icon: Upload,
    title: "Upload LaTeX",
    detail: "Import `.tex` + figures, or start blank / sample",
  },
  {
    n: "02",
    icon: MessageSquare,
    title: "Chat with Ario",
    detail: "Style, structure & citation suggestions",
  },
  {
    n: "03",
    icon: GitCompare,
    title: "Accept or Refuse",
    detail: "Tracked changes — you keep authorship",
  },
  {
    n: "04",
    icon: FileOutput,
    title: "Compile PDF",
    detail: "Preview & save LaTeX to your account",
  },
];

function WorkflowDiagram() {
  return (
    <div className="border border-foreground bg-background p-4 sm:p-8">
      <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-0">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li
              key={step.n}
              className="relative flex flex-col border border-foreground p-6 min-h-[220px] xl:border-r-0 xl:first:border-l xl:last:border-r xl:border-y xl:border-x-0 xl:[&:not(:last-child)]:border-r"
            >
              <span className="absolute top-0 left-0 bg-[color:var(--editorial-red)] text-background font-mono-data text-[10px] uppercase tracking-widest px-2 py-1">
                Step {step.n}
              </span>

              {i < steps.length - 1 ? (
                <ArrowRight
                  className="hidden xl:block absolute -right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground z-10 bg-background"
                  strokeWidth={1.5}
                  aria-hidden
                />
              ) : null}

              <div className="mt-6 h-12 w-12 border border-foreground flex items-center justify-center mb-4">
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>

              <h3 className="font-serif-display font-bold text-xl leading-tight">{step.title}</h3>
              <p className="font-body text-sm text-neutral-600 mt-2 leading-relaxed flex-1">{step.detail}</p>

              {step.n === "03" ? (
                <p className="mt-4 font-mono-data text-[10px] uppercase tracking-widest text-[color:var(--editorial-red)] border border-dashed border-foreground/40 px-2 py-1.5 text-center">
                  Author gate — no auto-apply
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function WorkflowLegend() {
  const items = [
    { icon: User, label: "You remain the author", desc: "Every edit requires your approval" },
    { icon: ShieldCheck, label: "Integrity guard", desc: "No fabricated data or citations" },
  ];
  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-foreground pt-8">
      {items.map(({ icon: Icon, label, desc }) => (
        <div key={label} className="flex items-start gap-4 border border-foreground/30 p-5">
          <div className="h-10 w-10 border border-foreground flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-serif-display font-bold text-lg">{label}</p>
            <p className="font-body text-sm text-neutral-600 mt-1">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkflowPage() {
  return (
    <MarketingLayout>
      <article className="border-b-4 border-foreground newsprint-texture">
        <div className="max-w-screen-xl mx-auto px-4 py-16 lg:py-20">
          <div className="max-w-3xl">
            <p className="font-mono-data uppercase text-xs tracking-widest text-neutral-600">
              {workflowContent.eyebrow}
            </p>
            <h1 className="mt-3 font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">
              {workflowContent.title}
            </h1>
            <p className="mt-6 font-body text-lg leading-relaxed text-neutral-700">{workflowContent.lede}</p>
          </div>

          <div className="mt-12">
            <div className="flex items-center justify-between border-b border-foreground pb-3 mb-6">
              <span className="font-mono-data uppercase text-xs tracking-widest">Fig. 2.1 · Process Flow</span>
              <span className="font-mono-data uppercase text-[10px] tracking-widest text-neutral-500 hidden sm:inline">
                LaTeX MVP · Phase 1
              </span>
            </div>
            <WorkflowDiagram />
            <WorkflowLegend />
          </div>

          <div className="mt-12 pt-8 border-t border-foreground/30 flex flex-wrap gap-6">
            <Link
              to="/"
              className="font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
            >
              ← Back to home
            </Link>
            <Link
              to="/projects"
              className="inline-flex items-center gap-2 font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)]"
            >
              Open Editor <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
