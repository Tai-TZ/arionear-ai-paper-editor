"""Do two titles name the same work? LaTeX-aware normalization + a fuzzy match (never substring containment).

BibTeX titles carry LaTeX (``{BERT}``, ``M{\\"u}ller``, ``$\\alpha$``) while database titles are plain text, so
both sides are reduced to casefolded words without accents or punctuation. A title that is merely a prefix of
another (``Attention`` vs ``Attention Is All You Need``) is a different work.
"""

from __future__ import annotations

import re
import unicodedata

from pylatexenc.latex2text import LatexNodes2Text
from rapidfuzz import fuzz

TITLE_MIN_FUZZY_RATIO = 90.0
TITLE_MIN_LENGTH_RATIO = 0.8

_LATEX_TO_TEXT = LatexNodes2Text(math_mode="text")
_LATEX_MARKUP_RE = re.compile(r"[\\{}$~]")
_UNESCAPED_PERCENT_RE = re.compile(r"(?<!\\)%")
_NON_WORD_RE = re.compile(r"[\W_]+")


def _latex_to_text(title: str) -> str:
    if not _LATEX_MARKUP_RE.search(title):
        return title
    try:
        # A bare "%" is literal in a plain-text title but would start a LaTeX comment.
        return _LATEX_TO_TEXT.latex_to_text(_UNESCAPED_PERCENT_RE.sub(r"\\%", title))
    except Exception:
        return title


def normalize_title(title: str) -> str:
    """LaTeX → text, accents removed, casefolded, punctuation/braces → spaces, whitespace collapsed."""
    text = unicodedata.normalize("NFKD", _latex_to_text(title or ""))
    text = "".join(char for char in text if not unicodedata.combining(char)).casefold()
    return " ".join(_NON_WORD_RE.sub(" ", text).split())


def titles_match(a: str, b: str) -> bool:
    """Equal once normalized, or ``token_sort_ratio`` ≥ 90 with the shorter title ≥ 80 % of the longer."""
    if not a or not b:
        return False
    na, nb = normalize_title(a), normalize_title(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    shorter, longer = sorted((len(na), len(nb)))
    return shorter / longer >= TITLE_MIN_LENGTH_RATIO and fuzz.token_sort_ratio(na, nb) >= TITLE_MIN_FUZZY_RATIO
