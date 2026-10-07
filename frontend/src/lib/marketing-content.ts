export type MarketingSection = {
  heading?: string;
  paragraphs: string[];
  bullets?: string[];
};

export type MarketingPageContent = {
  slug: string;
  title: string;
  eyebrow: string;
  lede: string;
  sections: MarketingSection[];
};

export const workflowContent: MarketingPageContent = {
  slug: "workflow",
  title: "How the Press Runs",
  eyebrow: "Section B · Workflow",
  lede: "Proofline Phase 1 focuses on LaTeX manuscripts. Upload your `.tex` source, collaborate with Nib in the editor, and keep every change under your control.",
  sections: [
    {
      heading: "Step 01 · Upload LaTeX",
      paragraphs: [
        "Create a blank project, start from the sample template, or upload a `.tex` file together with figure assets (`.png`, `.pdf`, `.eps`, …).",
        "DOCX and PDF import are not available in the current MVP.",
      ],
    },
    {
      heading: "Step 02 · Read the Markup",
      paragraphs: [
        "Chat with Nib to improve style, structure, or citations. Suggestions appear as tracked changes with a clear rationale.",
      ],
    },
    {
      heading: "Step 03 · Accept or Refuse",
      paragraphs: [
        "You remain the author. Approve, edit, or dismiss each suggestion. Nothing reaches your manuscript without consent.",
      ],
    },
    {
      heading: "Step 04 · Compile & Export",
      paragraphs: [
        "Compile the manuscript to PDF inside the editor, review the preview, and save your LaTeX source back to your account.",
      ],
    },
  ],
};

export const featuresContent: MarketingPageContent = {
  slug: "features",
  title: "The Editorial Desk",
  eyebrow: "Section A · Features",
  lede: "Tools that help researchers present strong science clearly — without inventing data or results.",
  sections: [
    {
      heading: "Academic Voice",
      paragraphs: [
        "Improve academic English while preserving the author's original meaning and argument.",
      ],
    },
    {
      heading: "Structure Guide",
      paragraphs: [
        "Get guidance on IMRAD sections — abstract, introduction, methods, results, and discussion.",
      ],
    },
    {
      heading: "Citation Format",
      paragraphs: [
        "Verify citations against external sources and keep BibTeX keys consistent with your manuscript.",
      ],
    },
    {
      heading: "Integrity Guard",
      paragraphs: [
        "Guardrails block numeric drift and unsupported claims. Every edit is reviewable before it lands in your draft.",
      ],
    },
  ],
};

export const integrityContent: MarketingPageContent = {
  slug: "integrity",
  title: "AI is the editor. You are the author.",
  eyebrow: "Editorial Policy",
  lede: "Proofline improves presentation — never the underlying scientific claims.",
  sections: [
    {
      paragraphs: [],
      bullets: [
        "AI never invents data, results, or measurements.",
        "Every reference is checked against the manuscript and available metadata.",
        "Edits preserve the author's argument and scientific meaning.",
        "All suggestions are reviewable, dismissible, and auditable.",
        "Manuscript content is never used to train external models.",
      ],
    },
  ],
};

export const latexGuideContent: MarketingPageContent = {
  slug: "latex-guide",
  title: "LaTeX Guide",
  eyebrow: "Authors · LaTeX",
  lede: "Everything you need to start with Proofline using LaTeX source files.",
  sections: [
    {
      heading: "Supported inputs",
      paragraphs: [
        "Upload a `.tex` main file. You may attach figures and supporting files in the same import dialog.",
      ],
      bullets: [
        "Main manuscript: `.tex` or `.latex`",
        "Figures: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.pdf`, `.eps`",
        "Supporting files: `.cls`, `.bst`, `.sty`, `.bib`",
      ],
    },
    {
      heading: "Getting started",
      paragraphs: [
        "Sign in, open Your Projects, then choose Blank project, Sample project, or Upload LaTeX file.",
        "The editor saves your work to your account automatically when you save or leave the session.",
      ],
    },
    {
      heading: "Compile preview",
      paragraphs: [
        "Use Compile in the editor to generate a PDF preview. Server-side TeX Live must be available on the backend.",
      ],
    },
  ],
};

export const aboutContent: MarketingPageContent = {
  slug: "about",
  title: "About Proofline",
  eyebrow: "Bureau",
  lede: "An AI editorial assistant built for researchers who need a fair reading — not a rewrite of their science.",
  sections: [
    {
      paragraphs: [
        "Proofline helps authors improve language, structure, and citations while keeping the human author in control.",
        "Proofline is designed and built by Nguyễn Thành Tài.",
      ],
    },
  ],
};

export const contactContent: MarketingPageContent = {
  slug: "contact",
  title: "Contact",
  eyebrow: "Bureau",
  lede: "Reach the editorial desk for support, partnerships, or feedback.",
  sections: [
    {
      paragraphs: [
        "Email: support@proofline.example",
        "For bug reports or feature requests, please include the steps to reproduce and the browser you are using.",
      ],
    },
  ],
};

export const termsContent: MarketingPageContent = {
  slug: "terms",
  title: "Terms of Use",
  eyebrow: "Legal",
  lede: "By using Proofline you agree to use the service for legitimate academic editing purposes.",
  sections: [
    {
      paragraphs: [
        "You retain ownership of your manuscripts. Proofline provides suggestions only; you are responsible for the final submitted work.",
        "Do not upload confidential or export-controlled material unless you are authorized to do so.",
      ],
    },
  ],
};

export const privacyContent: MarketingPageContent = {
  slug: "privacy",
  title: "Privacy Policy",
  eyebrow: "Legal",
  lede: "How we handle account and manuscript data in the MVP.",
  sections: [
    {
      paragraphs: [
        "Account data (name, email, affiliation) is stored in the application database when DATABASE_URL is configured.",
        "Manuscript LaTeX source is stored per user account. Sign out clears local browser storage on your device.",
      ],
    },
  ],
};

export const ethicsContent: MarketingPageContent = {
  slug: "ethics",
  title: "Ethics",
  eyebrow: "Legal",
  lede: "Academic integrity principles that govern Proofline.",
  sections: [
    {
      bullets: [
        "Authors must verify all AI-assisted edits before submission.",
        "The system must not be used to fabricate data, results, or citations.",
        "Institutional authorship and authorship policies remain the author's responsibility.",
      ],
      paragraphs: [],
    },
  ],
};

export const dataUseContent: MarketingPageContent = {
  slug: "data-use",
  title: "Data Use",
  eyebrow: "Legal",
  lede: "What happens to your manuscript and chat data.",
  sections: [
    {
      paragraphs: [
        "Manuscript content is sent to configured LLM providers only to generate editing suggestions for your session.",
        "We do not use your manuscripts to train public models. Refer to your LLM provider's policy for subprocessors.",
      ],
    },
  ],
};
