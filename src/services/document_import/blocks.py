"""Format-neutral intermediate representation produced by the adapters.

``latex`` fields hold already-escaped LaTeX; ``plain`` fields hold the raw text used for heuristics.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class HeadingBlock:
    level: int  # 1 = \section, 2 = \subsection, 3 = \subsubsection, 4 = \paragraph
    latex: str
    plain: str


@dataclass
class ParagraphBlock:
    latex: str
    plain: str


@dataclass
class ListItemBlock:
    ordered: bool
    level: int  # 0-based nesting level
    latex: str


@dataclass
class TableCell:
    latex: str
    span: int = 1


@dataclass
class TableBlock:
    rows: list[list[TableCell]]
    caption: str | None = None


@dataclass
class FigureBlock:
    path: str
    width: float = 0.8  # fraction of \linewidth
    caption: str | None = None


@dataclass
class AbstractBlock:
    paragraphs: list[str] = field(default_factory=list)


@dataclass
class CommentBlock:
    text: str


Block = HeadingBlock | ParagraphBlock | ListItemBlock | TableBlock | FigureBlock | AbstractBlock | CommentBlock
