import type { ReactNode } from "react";
import { HeroPeerReviewFigure } from "@/components/marketing/hero-figure";
import type { GuideDemoId, GuideDemoLabels } from "@/lib/guide-i18n";

function Skel({ className }: { className?: string }) {
  return <span className={`guide-demo-skel${className ? ` ${className}` : ""}`} />;
}

function Chrome({ children }: { children: ReactNode }) {
  return <div className="guide-demo-chrome font-mono-data text-[10px] uppercase tracking-widest">{children}</div>;
}

function ProjectsDemo({ d }: { d: GuideDemoLabels }) {
  return (
    <div className="guide-demo" aria-hidden>
      <Chrome>{d.projectsChrome}</Chrome>
      <div className="guide-demo-body guide-demo-projects">
        <div className="guide-demo-projects-toolbar">
          <span className="guide-demo-pulse-btn">{d.newBtn}</span>
        </div>
        <div className="guide-demo-projects-row guide-demo-row-active">
          <Skel className="guide-demo-skel-title" />
          <Skel className="guide-demo-skel-meta" />
        </div>
        <div className="guide-demo-projects-row">
          <Skel className="guide-demo-skel-title" />
          <Skel className="guide-demo-skel-meta" />
        </div>
        <div className="guide-demo-projects-row">
          <Skel className="guide-demo-skel-title" />
          <Skel className="guide-demo-skel-meta" />
        </div>
      </div>
    </div>
  );
}

function EditorDemo({ d }: { d: GuideDemoLabels }) {
  return (
    <div className="guide-demo" aria-hidden>
      <Chrome>{d.editorChrome}</Chrome>
      <div className="guide-demo-body guide-demo-editor">
        <div className="guide-demo-editor-col guide-demo-editor-files">
          <p className="guide-demo-col-label">{d.files}</p>
          <Skel className="guide-demo-skel-file" />
          <Skel className="guide-demo-skel-file guide-demo-skel-file-short" />
          <Skel className="guide-demo-skel-file" />
        </div>
        <div className="guide-demo-editor-col guide-demo-editor-source">
          <p className="guide-demo-col-label">{d.source}</p>
          <Skel className="guide-demo-skel-line" />
          <Skel className="guide-demo-skel-line guide-demo-skel-line-active" />
          <Skel className="guide-demo-skel-line" />
          <Skel className="guide-demo-skel-line guide-demo-skel-line-short" />
          <span className="guide-demo-cursor" />
        </div>
        <div className="guide-demo-editor-col guide-demo-editor-preview">
          <p className="guide-demo-col-label">{d.preview}</p>
          <div className="guide-demo-pdf-page">
            <Skel className="guide-demo-skel-pdf-block" />
            <Skel className="guide-demo-skel-pdf-line" />
            <Skel className="guide-demo-skel-pdf-line" />
            <Skel className="guide-demo-skel-pdf-line guide-demo-skel-pdf-line-short" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CompileDemo({ d }: { d: GuideDemoLabels }) {
  return (
    <div className="guide-demo" aria-hidden>
      <Chrome>{d.compileChrome}</Chrome>
      <div className="guide-demo-body guide-demo-compile">
        <div className="guide-demo-compile-toolbar">
          <span className="guide-demo-pulse-btn guide-demo-compile-btn">{d.compileBtn}</span>
          <span className="guide-demo-compile-status">{d.compiling}</span>
        </div>
        <div className="guide-demo-compile-progress" role="presentation">
          <div className="guide-demo-compile-progress-fill" />
        </div>
        <div className="guide-demo-pdf-page guide-demo-pdf-reveal">
          <Skel className="guide-demo-skel-pdf-block" />
          <Skel className="guide-demo-skel-pdf-line" />
          <Skel className="guide-demo-skel-pdf-line" />
        </div>
      </div>
    </div>
  );
}

function DefenseDemo({ d }: { d: GuideDemoLabels }) {
  return (
    <div className="guide-demo" aria-hidden>
      <Chrome>{d.defenseChrome}</Chrome>
      <div className="guide-demo-body guide-demo-defense">
        <div className="guide-demo-defense-chat">
          <p className="guide-demo-col-label">{d.council}</p>
          <div className="guide-demo-bubble guide-demo-bubble-q guide-demo-bubble-in-1">
            <Skel className="guide-demo-skel-bubble" />
          </div>
          <div className="guide-demo-bubble guide-demo-bubble-a guide-demo-bubble-in-2">
            <Skel className="guide-demo-skel-bubble guide-demo-skel-bubble-short" />
          </div>
          <div className="guide-demo-bubble guide-demo-bubble-q guide-demo-bubble-in-3">
            <Skel className="guide-demo-skel-bubble" />
          </div>
        </div>
        <div className="guide-demo-defense-pdf">
          <p className="guide-demo-col-label">{d.preview}</p>
          <div className="guide-demo-pdf-page">
            <Skel className="guide-demo-skel-pdf-block" />
            <Skel className="guide-demo-skel-pdf-line" />
            <Skel className="guide-demo-skel-pdf-line guide-demo-skel-highlight" />
            <Skel className="guide-demo-skel-pdf-line" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountDemo({ d }: { d: GuideDemoLabels }) {
  return (
    <div className="guide-demo" aria-hidden>
      <Chrome>{d.accountChrome}</Chrome>
      <div className="guide-demo-body guide-demo-account">
        <div className="guide-demo-account-card">
          <div className="guide-demo-account-avatar" />
          <div className="guide-demo-account-copy">
            <Skel className="guide-demo-skel-name" />
            <Skel className="guide-demo-skel-email" />
          </div>
          <div className="guide-demo-account-plan">
            <span>{d.plan}</span>
            <span className="guide-demo-plan-badge guide-demo-pulse-badge">Pro</span>
          </div>
        </div>
        <div className="guide-demo-account-nav">
          <div className="guide-demo-skel-nav-row" />
          <div className="guide-demo-skel-nav-row guide-demo-nav-active-row">
            <span className="guide-demo-nav-label">{d.profile}</span>
          </div>
          <div className="guide-demo-skel-nav-row">
            <span className="guide-demo-nav-label">{d.plan}</span>
            <span className="guide-demo-plan-badge guide-demo-pulse-badge">Pro</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GuideStepDemo({ id, labels }: { id: GuideDemoId; labels: GuideDemoLabels }) {
  switch (id) {
    case "projects":
      return <ProjectsDemo d={labels} />;
    case "editor":
      return <EditorDemo d={labels} />;
    case "chat":
      return (
        <div className="guide-demo guide-demo-chat-wrap">
          <HeroPeerReviewFigure />
        </div>
      );
    case "compile":
      return <CompileDemo d={labels} />;
    case "defense":
      return <DefenseDemo d={labels} />;
    case "account":
      return <AccountDemo d={labels} />;
  }
}
