"""Built-in publisher starter templates (Springer LNCS, Elsevier) for the template gallery.

The publisher classes (``llncs``, ``elsarticle``) and their BibTeX styles ship with
TeX Live (``texlive-publishers``) under the LPPL, so only the skeleton sources live here; the
``.cls``/``.bst`` files are never vendored. The IEEE journal template is seeded separately by
``src.services.template_store`` and is intentionally left untouched.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class BuiltinTemplate:
    """A gallery template seeded on first start (registry metadata plus the files of its folder)."""

    id: str
    document_class: str
    bibliography_style: str
    sample_title: str
    """ASCII-only title written into the placeholder sample PDF."""
    metadata: dict[str, Any]
    """Registry fields except ``id``/``slug``/timestamps, in registry key order."""
    files: dict[str, str]
    """Relative path -> UTF-8 text content (``main.tex``, ``references.bib``, ``preview.svg``)."""
    superseded_licenses: tuple[str, ...] = ()
    """Earlier default ``license`` labels; seeded rows still carrying one are updated to the current label."""

    def registry_row(self, now: str) -> dict[str, Any]:
        return {
            "id": self.id,
            "slug": self.id,
            **copy.deepcopy(self.metadata),
            "created_at": now,
            "updated_at": now,
        }


_TEMPLATE_LICENSE = "LPPL (publisher class and BibTeX style ship with TeX Live)"
# The LNCS skeleton reuses placeholder text from Springer's LNCS sample paper, which Springer publishes
# under CC BY 4.0 (attribution plus an indication of changes).
_LNCS_LICENSE = (
    "CC BY 4.0 — adapted from Springer's LNCS sample paper (samplepaper.tex); shortened and "
    "reorganised into an IMRaD outline for Edico"
)


def _svg_rules(x: int, y: int, width: int, count: int, step: int = 8) -> str:
    """Grey rules standing in for body text in the preview thumbnails."""
    lines = []
    for index in range(count):
        end = x + (width if index < count - 1 else width * 2 // 3)
        lines.append(f'    <line x1="{x}" y1="{y + index * step}" x2="{end}" y2="{y + index * step}"/>\n')
    return '  <g stroke="#e5e7eb" stroke-width="2">\n' + "".join(lines) + "  </g>\n"


# ─── Springer LNCS (llncs) ───────────────────────────────────────────────────

SPRINGER_LNCS_MAIN_TEX = r"""% Springer LNCS conference proceedings starter for Edico Paper IDE.
% llncs.cls and splncs04.bst ship with TeX Live (texlive-publishers); follow the
% Springer LNCS author guidelines for page limits and final-version requirements.
\documentclass[runningheads]{llncs}

\usepackage[T1]{fontenc}
\usepackage{graphicx}
\usepackage{amsmath}

\begin{document}

\title{Contribution Title for a Springer LNCS Paper\thanks{Supported by organization X.}}
\titlerunning{Abbreviated Paper Title}

% Add ORCID iDs after each name with \orcidID{0000-0000-0000-0000} if available.
\author{First Author\inst{1} \and
Second Author\inst{1,2} \and
Third Author\inst{2}}
\authorrunning{F. Author et al.}

\institute{Department of Computer Science, Example University, City, Country\\
\email{first.author@example.edu} \and
Research Institute of Example Sciences, City, Country\\
\email{\{second.author,third.author\}@example.org}}

\maketitle

\begin{abstract}
The abstract should briefly summarize the contents of the paper in 150--250 words.
State the problem, the approach, the main results, and why they matter.

\keywords{First keyword \and Second keyword \and Another keyword.}
\end{abstract}

\section{Introduction}
\label{sec:introduction}
Introduce the research problem, its context, and the contributions of this paper.
Cite related work as you discuss it~\cite{example-article,example-book}.

\section{Methods}
\label{sec:methods}
Describe the data, models, and experimental protocol in enough detail to reproduce the study.
Number the displayed equations you refer to later, such as Eq.~\eqref{eq:prediction}:
\begin{equation}
  \hat{y} = \arg\max_{y} \, p(y \mid x).
  \label{eq:prediction}
\end{equation}

\section{Results}
\label{sec:results}
Report the main findings. Table~\ref{tab:results} and Fig.~\ref{fig:overview} are placeholders.

\begin{table}
\caption{Table captions should be placed above the tables.}
\label{tab:results}
\centering
\begin{tabular}{lcc}
\hline
Method & Accuracy (\%) & Runtime (s)\\
\hline
Baseline & 00.0 & 0.0\\
Proposed & 00.0 & 0.0\\
\hline
\end{tabular}
\end{table}

\begin{figure}
\centering
\fbox{\parbox[c][3cm][c]{0.6\textwidth}{\centering Figure placeholder:\\
replace this box with your own graphic.}}
\caption{A figure caption is always placed below the illustration.}
\label{fig:overview}
\end{figure}

\section{Discussion}
\label{sec:discussion}
Interpret the results, compare them with prior work~\cite{example-proceedings}, and state the limitations.

\section{Conclusion}
\label{sec:conclusion}
Summarize the contributions and outline future work.

\subsubsection*{Acknowledgments.}
Acknowledge funding sources and contributors here.

\bibliographystyle{splncs04}
\bibliography{references}

\end{document}
"""

SPRINGER_LNCS_BIB = """@article{example-article,
  author  = {Author, First and Author, Second},
  title   = {Title of an example journal article},
  journal = {Journal Name},
  volume  = {2},
  number  = {5},
  pages   = {99--110},
  year    = {2024}
}

@inproceedings{example-proceedings,
  author    = {Author, First and Author, Second and Author, Third},
  title     = {Title of an example conference paper},
  booktitle = {Proceedings of the Example Conference on Computer Science},
  series    = {Lecture Notes in Computer Science},
  volume    = {9999},
  pages     = {1--13},
  publisher = {Springer},
  address   = {Cham},
  year      = {2024}
}

@book{example-book,
  author    = {Author, First and Author, Second},
  title     = {Title of an Example Book},
  edition   = {2nd},
  publisher = {Publisher},
  address   = {Location},
  year      = {2023}
}
"""

SPRINGER_LNCS_PREVIEW_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420">\n'
    '  <rect width="320" height="420" fill="#ffffff" stroke="#d1d5db"/>\n'
    '  <text x="160" y="50" text-anchor="middle" font-family="Georgia, serif" font-size="11"'
    ' font-weight="bold" fill="#111827">Springer LNCS Template</text>\n'
    '  <text x="160" y="68" text-anchor="middle" font-family="Georgia, serif" font-size="8"'
    ' fill="#374151">First Author, Second Author, and Third Author</text>\n'
    '  <text x="160" y="81" text-anchor="middle" font-family="Georgia, serif" font-size="6.5"'
    ' fill="#6b7280">Example University / Research Institute</text>\n'
    '  <rect x="64" y="94" width="192" height="64" fill="#f9fafb" stroke="#e5e7eb"/>\n'
    '  <text x="72" y="107" font-family="Georgia, serif" font-size="7" font-weight="bold"'
    ' fill="#374151">Abstract.</text>\n'
    + _svg_rules(72, 116, 176, 3)
    + '  <text x="72" y="150" font-family="Georgia, serif" font-size="6.5" fill="#6b7280">'
    "Keywords: First keyword - Second keyword</text>\n"
    '  <text x="64" y="182" font-family="Georgia, serif" font-size="8" font-weight="bold"'
    ' fill="#111827">1 Introduction</text>\n'
    + _svg_rules(64, 194, 192, 5)
    + '  <text x="64" y="252" font-family="Georgia, serif" font-size="8" font-weight="bold"'
    ' fill="#111827">2 Methods</text>\n'
    + _svg_rules(64, 264, 192, 4)
    + '  <rect x="112" y="300" width="96" height="48" fill="#f3f4f6" stroke="#e5e7eb"/>\n'
    '  <text x="160" y="362" text-anchor="middle" font-family="Georgia, serif" font-size="6.5"'
    ' fill="#6b7280">Fig. 1. Figure caption below the illustration.</text>\n'
    '  <text x="160" y="400" text-anchor="middle" font-family="Arial, sans-serif" font-size="6"'
    ' fill="#9ca3af">llncs / splncs04</text>\n'
    "</svg>\n"
)

SPRINGER_LNCS = BuiltinTemplate(
    id="springer-lncs",
    document_class="llncs",
    bibliography_style="splncs04",
    sample_title="Springer LNCS Template Sample",
    metadata={
        "title": "Springer LNCS conference proceedings template (llncs) with BibTeX example",
        "title_vi": "Mẫu Springer LNCS cho kỷ yếu hội nghị (llncs, kèm ví dụ BibTeX)",
        "description": (
            "Official-style Springer Lecture Notes in Computer Science (LNCS) starter with the llncs class, "
            "author/institute block, keywords, and splncs04 bibliography for Edico Paper IDE."
        ),
        "description_vi": (
            "Mẫu khởi tạo bài kỷ yếu hội nghị Springer LNCS với lớp llncs, khối tác giả/đơn vị, "
            "từ khóa và tài liệu tham khảo kiểu splncs04 cho Paper IDE Edico."
        ),
        "abstract": (
            "This is a skeleton file for papers in Springer Lecture Notes in Computer Science (LNCS) "
            "proceedings, using llncs.cls as distributed with TeX Live (CTAN). It shows the LNCS title, "
            "author and institute syntax, keywords, an IMRaD outline, table and figure placeholders, "
            "and a BibTeX example formatted with splncs04."
        ),
        "abstract_vi": (
            "Đây là file khung cho bài kỷ yếu hội nghị Springer LNCS, dùng llncs.cls có sẵn trong TeX Live "
            "(CTAN). File minh họa cách khai báo tiêu đề, tác giả và đơn vị theo LNCS, từ khóa, dàn ý IMRaD, "
            "bảng/hình giữ chỗ và ví dụ BibTeX theo kiểu splncs04."
        ),
        "author": "Springer template (Edico gallery)",
        "license": _LNCS_LICENSE,
        "tags": [
            "Citations",
            "Springer Official Templates",
            "Springer (all)",
            "Conference proceedings",
            "Bibliographies",
        ],
        "is_official": True,
        "format": "springer",
        "venue": "conference",
        "featured": False,
    },
    files={
        "main.tex": SPRINGER_LNCS_MAIN_TEX,
        "references.bib": SPRINGER_LNCS_BIB,
        "preview.svg": SPRINGER_LNCS_PREVIEW_SVG,
    },
    superseded_licenses=(_TEMPLATE_LICENSE,),
)


# ─── Elsevier (elsarticle, preprint) ─────────────────────────────────────────

ELSEVIER_ELSARTICLE_MAIN_TEX = r"""% Elsevier journal article starter (preprint) for Edico Paper IDE.
% elsarticle.cls and elsarticle-num.bst ship with TeX Live (texlive-publishers); check the
% Guide for Authors of your target journal for its reference style and length limits.
\documentclass[preprint,12pt]{elsarticle}

%% Double line spacing for review: \documentclass[preprint,review,12pt]{elsarticle}
%% Author-year citations: add the authoryear option and use elsarticle-harv.

\usepackage{amssymb}
\usepackage{amsmath}
\usepackage{graphicx}

\journal{Journal Name}

\begin{document}

\begin{frontmatter}

\title{Title of an Elsevier Journal Article}

\author[inst1]{First Author\corref{cor1}}
\ead{first.author@example.edu}
\cortext[cor1]{Corresponding author.}

\author[inst1,inst2]{Second Author}
\author[inst2]{Third Author}

\affiliation[inst1]{organization={Department of Example Sciences, Example University},
            addressline={1 University Road},
            city={City},
            postcode={00000},
            country={Country}}

\affiliation[inst2]{organization={Research Institute of Example Sciences},
            city={City},
            country={Country}}

\begin{abstract}
The abstract should state the purpose of the research, the principal results, and the major
conclusions in a single paragraph, without references or undefined abbreviations.
\end{abstract}

\begin{keyword}
First keyword \sep Second keyword \sep Third keyword
%% PACS codes: \PACS code \sep code
%% MSC codes: \MSC[2020] code \sep code
\end{keyword}

\end{frontmatter}

\section{Introduction}
\label{sec:introduction}
State the objectives of the work and provide an adequate background, avoiding a detailed
literature survey~\cite{example-article,example-book}.

\section{Materials and methods}
\label{sec:methods}
Provide sufficient detail to allow the work to be reproduced. Number the displayed equations
you refer to later, such as Eq.~\eqref{eq:model}:
\begin{equation}
  y_i = \beta_0 + \beta_1 x_i + \varepsilon_i, \qquad \varepsilon_i \sim \mathcal{N}(0, \sigma^2).
  \label{eq:model}
\end{equation}

\section{Results}
\label{sec:results}
Results should be clear and concise. Table~\ref{tab:results} and Fig.~\ref{fig:overview} are placeholders.

\begin{table}[htbp]
\centering
\caption{Table captions are placed above the table.}
\label{tab:results}
\begin{tabular}{lcc}
\hline
Condition & Mean & SD\\
\hline
Control & 0.00 & 0.00\\
Treatment & 0.00 & 0.00\\
\hline
\end{tabular}
\end{table}

\begin{figure}[htbp]
\centering
\fbox{\parbox[c][4cm][c]{0.6\textwidth}{\centering Figure placeholder:\\
replace this box with your own graphic.}}
\caption{Figure captions are placed below the figure.}
\label{fig:overview}
\end{figure}

\section{Discussion}
\label{sec:discussion}
Explore the significance of the results and compare them with previous studies~\cite{example-proceedings}.

\section{Conclusions}
\label{sec:conclusions}
Summarize the main conclusions of the study.

\section*{Declaration of competing interest}
The authors declare that they have no known competing financial interests or personal relationships
that could have appeared to influence the work reported in this paper.

\section*{Data availability}
Describe where the data supporting the findings can be accessed.

\bibliographystyle{elsarticle-num}
\bibliography{references}

\end{document}
"""

ELSEVIER_ELSARTICLE_BIB = """@article{example-article,
  author  = {Author, First and Author, Second},
  title   = {Title of an example journal article},
  journal = {Journal Name},
  volume  = {12},
  number  = {3},
  pages   = {101--115},
  year    = {2024}
}

@inproceedings{example-proceedings,
  author    = {Author, First and Author, Third},
  title     = {Title of an example conference paper},
  booktitle = {Proceedings of the Example Conference},
  pages     = {45--52},
  publisher = {Publisher},
  address   = {City},
  year      = {2023}
}

@book{example-book,
  author    = {Author, First},
  title     = {Title of an Example Book},
  edition   = {2nd},
  publisher = {Publisher},
  address   = {City},
  year      = {2022}
}
"""

ELSEVIER_ELSARTICLE_PREVIEW_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420">\n'
    '  <rect width="320" height="420" fill="#ffffff" stroke="#d1d5db"/>\n'
    '  <text x="160" y="48" text-anchor="middle" font-family="Georgia, serif" font-size="11"'
    ' fill="#111827">Elsevier elsarticle Template</text>\n'
    '  <text x="160" y="66" text-anchor="middle" font-family="Georgia, serif" font-size="8"'
    ' fill="#374151">First Author, Second Author, Third Author</text>\n'
    '  <text x="160" y="79" text-anchor="middle" font-family="Georgia, serif" font-size="6.5"'
    ' font-style="italic" fill="#6b7280">Example University / Research Institute</text>\n'
    '  <line x1="40" y1="92" x2="280" y2="92" stroke="#9ca3af" stroke-width="0.8"/>\n'
    '  <text x="40" y="106" font-family="Georgia, serif" font-size="7" font-weight="bold"'
    ' fill="#374151">Abstract</text>\n'
    + _svg_rules(40, 116, 240, 4)
    + '  <text x="40" y="154" font-family="Georgia, serif" font-size="6.5" font-style="italic"'
    ' fill="#6b7280">Keywords: First keyword, Second keyword</text>\n'
    '  <line x1="40" y1="162" x2="280" y2="162" stroke="#9ca3af" stroke-width="0.8"/>\n'
    '  <text x="40" y="186" font-family="Georgia, serif" font-size="8" font-weight="bold"'
    ' fill="#111827">1. Introduction</text>\n'
    + _svg_rules(40, 198, 240, 6)
    + '  <text x="40" y="262" font-family="Georgia, serif" font-size="8" font-weight="bold"'
    ' fill="#111827">2. Materials and methods</text>\n'
    + _svg_rules(40, 274, 240, 6)
    + '  <line x1="40" y1="384" x2="120" y2="384" stroke="#9ca3af" stroke-width="0.6"/>\n'
    '  <text x="40" y="396" font-family="Georgia, serif" font-size="6" font-style="italic"'
    ' fill="#6b7280">Preprint submitted to Journal Name</text>\n'
    '  <text x="280" y="396" text-anchor="end" font-family="Arial, sans-serif" font-size="6"'
    ' fill="#9ca3af">elsarticle / elsarticle-num</text>\n'
    "</svg>\n"
)

ELSEVIER_ELSARTICLE = BuiltinTemplate(
    id="elsevier-elsarticle",
    document_class="elsarticle",
    bibliography_style="elsarticle-num",
    sample_title="Elsevier elsarticle Template Sample",
    metadata={
        "title": "Elsevier journal article template (elsarticle, preprint) with BibTeX example",
        "title_vi": "Mẫu bài báo tạp chí Elsevier (elsarticle, bản preprint, kèm ví dụ BibTeX)",
        "description": (
            "Official-style Elsevier journal starter with the elsarticle class in preprint mode, frontmatter "
            "with affiliations, keywords, and elsarticle-num bibliography for Edico Paper IDE."
        ),
        "description_vi": (
            "Mẫu khởi tạo bài báo tạp chí Elsevier với lớp elsarticle ở chế độ preprint, khối frontmatter "
            "kèm đơn vị, từ khóa và tài liệu tham khảo kiểu elsarticle-num cho Paper IDE Edico."
        ),
        "abstract": (
            "This is a skeleton file for Elsevier journal submissions using elsarticle.cls (preprint option) "
            "as distributed with TeX Live (CTAN). It shows the frontmatter with a corresponding author and "
            "key-value affiliations, the keyword environment, an IMRaD outline, table and figure placeholders, "
            "competing-interest and data-availability statements, and a BibTeX example formatted with "
            "elsarticle-num."
        ),
        "abstract_vi": (
            "Đây là file khung cho bài gửi tạp chí Elsevier, dùng elsarticle.cls (tùy chọn preprint) có sẵn "
            "trong TeX Live (CTAN). File minh họa frontmatter với tác giả liên hệ và đơn vị dạng key-value, "
            "môi trường keyword, dàn ý IMRaD, bảng/hình giữ chỗ, tuyên bố xung đột lợi ích và tính sẵn có "
            "của dữ liệu, cùng ví dụ BibTeX theo kiểu elsarticle-num."
        ),
        "author": "Elsevier template (Edico gallery)",
        "license": _TEMPLATE_LICENSE,
        "tags": [
            "Citations",
            "Elsevier Official Templates",
            "Elsevier (all)",
            "Journal articles",
            "Bibliographies",
        ],
        "is_official": True,
        "format": "elsevier",
        "venue": "journal",
        "featured": False,
    },
    files={
        "main.tex": ELSEVIER_ELSARTICLE_MAIN_TEX,
        "references.bib": ELSEVIER_ELSARTICLE_BIB,
        "preview.svg": ELSEVIER_ELSARTICLE_PREVIEW_SVG,
    },
)


PUBLISHER_TEMPLATES: tuple[BuiltinTemplate, ...] = (SPRINGER_LNCS, ELSEVIER_ELSARTICLE)
"""Built-ins seeded next to the IEEE journal template, in gallery seed order."""
