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

function SlashDemo({ d }: { d: GuideDemoLabels }) {
  return (
    <div className="guide-demo" aria-hidden>
      <Chrome>{d.slashChrome}</Chrome>
      <div className="guide-demo-body guide-demo-slash">
        <div className="guide-demo-slash-input-wrap">
          <span className="guide-demo-slash-input font-mono-data">{d.slashInput}</span>
          <span className="guide-demo-cursor guide-demo-slash-cursor" />
        </div>
        <div className="guide-demo-slash-menu">
          <div className="guide-demo-slash-item guide-demo-slash-item-active">
            <span className="guide-demo-slash-cmd">/logic</span>
            <span className="guide-demo-slash-desc">{d.slashMenuLogic}</span>
          </div>
          <div className="guide-demo-slash-item guide-demo-slash-item-2">
            <span className="guide-demo-slash-cmd">/logic full</span>
            <span className="guide-demo-slash-desc">{d.slashMenuLogicFull}</span>
          </div>
          <div className="guide-demo-slash-item guide-demo-slash-item-3">
            <span className="guide-demo-slash-cmd">/edit</span>
            <span className="guide-demo-slash-desc">{d.slashMenuEdit}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolsDemo({ d }: { d: GuideDemoLabels }) {
  const tabs = [
    d.toolsTabInfo,
    d.toolsTabStructure,
    d.toolsTabLogic,
    d.toolsTabCitations,
    d.toolsTabVersions,
  ];
  return (
    <div className="guide-demo" aria-hidden>
      <Chrome>{d.toolsChrome}</Chrome>
      <div className="guide-demo-body guide-demo-tools">
        <div className="guide-demo-tools-tabs">
          {tabs.map((label, index) => (
            <span
              key={label}
              className={`guide-demo-tools-tab${index === 2 ? " guide-demo-tools-tab-active" : ""}`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="guide-demo-tools-content">
          <div className="guide-demo-tools-row">
            <span className="guide-demo-tools-label">{d.toolsAutoCompile}</span>
            <span className="guide-demo-tools-toggle guide-demo-pulse-badge" />
          </div>
          <div className="guide-demo-tools-stat-grid">
            <div className="guide-demo-tools-stat">
              <Skel className="guide-demo-skel-meta" />
              <Skel className="guide-demo-skel-title" />
            </div>
            <div className="guide-demo-tools-stat">
              <Skel className="guide-demo-skel-meta" />
              <Skel className="guide-demo-skel-title" />
            </div>
            <div className="guide-demo-tools-stat guide-demo-tools-stat-flag">
              <Skel className="guide-demo-skel-bubble" />
              <Skel className="guide-demo-skel-bubble guide-demo-skel-bubble-short" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreDemo({ d }: { d: GuideDemoLabels }) {
  const dims = [
    { label: d.scoreStructure, width: "82%" },
    { label: d.scoreLogic, width: "68%" },
    { label: d.scoreCitations, width: "91%" },
    { label: d.scorePeerReview, width: "74%" },
  ];
  return (
    <div className="guide-demo" aria-hidden>
      <Chrome>{d.scoreChrome}</Chrome>
      <div className="guide-demo-body guide-demo-score">
        <div className="guide-demo-score-ring-wrap">
          <div className="guide-demo-score-ring" role="presentation">
            <span className="guide-demo-score-value font-mono-data">78</span>
          </div>
          <p className="guide-demo-col-label">{d.scoreOverall}</p>
        </div>
        <div className="guide-demo-score-dims">
          {dims.map((dim) => (
            <div key={dim.label} className="guide-demo-score-dim">
              <div className="guide-demo-score-dim-head">
                <span>{dim.label}</span>
                <Skel className="guide-demo-skel-meta" />
              </div>
              <div className="guide-demo-score-bar">
                <div className="guide-demo-score-bar-fill" style={{ width: dim.width }} />
              </div>
            </div>
          ))}
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
    case "slash":
      return <SlashDemo d={labels} />;
    case "tools":
      return <ToolsDemo d={labels} />;
    case "score":
      return <ScoreDemo d={labels} />;
  }
}
