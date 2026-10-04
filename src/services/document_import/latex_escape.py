"""LaTeX escaping for text extracted from Word / PDF documents.

Everything here is pure string manipulation so it can be unit-tested without fixtures.
"""

from __future__ import annotations

import re

# The ten characters with a special meaning in LaTeX text mode.
_SPECIAL_CHARS: dict[str, str] = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}

# Unicode that pdflatex cannot typeset from UTF-8 input but that math mode handles everywhere.
_MATH_SYMBOLS: dict[str, str] = {
    "α": r"\alpha",
    "β": r"\beta",
    "γ": r"\gamma",
    "δ": r"\delta",
    "ε": r"\varepsilon",
    "ζ": r"\zeta",
    "η": r"\eta",
    "θ": r"\theta",
    "ι": r"\iota",
    "κ": r"\kappa",
    "λ": r"\lambda",
    "μ": r"\mu",
    "ν": r"\nu",
    "ξ": r"\xi",
    "π": r"\pi",
    "ρ": r"\rho",
    "σ": r"\sigma",
    "ς": r"\varsigma",
    "τ": r"\tau",
    "υ": r"\upsilon",
    "φ": r"\varphi",
    "χ": r"\chi",
    "ψ": r"\psi",
    "ω": r"\omega",
    "Γ": r"\Gamma",
    "Δ": r"\Delta",
    "Θ": r"\Theta",
    "Λ": r"\Lambda",
    "Ξ": r"\Xi",
    "Π": r"\Pi",
    "Σ": r"\Sigma",
    "Υ": r"\Upsilon",
    "Φ": r"\Phi",
    "Ψ": r"\Psi",
    "Ω": r"\Omega",
    "≤": r"\leq",
    "≥": r"\geq",
    "≠": r"\neq",
    "≈": r"\approx",
    "≡": r"\equiv",
    "∼": r"\sim",
    "∝": r"\propto",
    "∞": r"\infty",
    "→": r"\rightarrow",
    "←": r"\leftarrow",
    "↔": r"\leftrightarrow",
    "⇒": r"\Rightarrow",
    "⇐": r"\Leftarrow",
    "⇔": r"\Leftrightarrow",
    "∈": r"\in",
    "∉": r"\notin",
    "⊂": r"\subset",
    "⊆": r"\subseteq",
    "⊃": r"\supset",
    "⊇": r"\supseteq",
    "∪": r"\cup",
    "∩": r"\cap",
    "∅": r"\emptyset",
    "∀": r"\forall",
    "∃": r"\exists",
    "∑": r"\sum",
    "∏": r"\prod",
    "∫": r"\int",
    "√": r"\surd",
    "∂": r"\partial",
    "∇": r"\nabla",
    "⋅": r"\cdot",
    "∗": r"\ast",
    "−": "-",
    "′": "'",
    "″": "''",
}

# Characters normalised to plain text (ligatures from PDFs, invisible / special spaces from Word).
_PLAIN_REPLACEMENTS: dict[str, str] = {
    " ": "~",  # no-break space
    "­": r"\-",  # soft hyphen
    " ": " ",
    " ": " ",
    " ": r"\,",
    "​": "",
    "‌": "",
    "‍": "",
    "﻿": "",
    "‐": "-",
    "‑": "-",
    "ﬀ": "ff",
    "ﬁ": "fi",
    "ﬂ": "fl",
    "ﬃ": "ffi",
    "ﬄ": "ffl",
    "ﬅ": "st",
    "ﬆ": "st",
    "\t": " ",
    "\r": " ",
    "\n": " ",
}

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# Non-Latin-1 characters that pdflatex handles out of the box (T1 + TS1 via the UTF-8 input default).
_PDFLATEX_SAFE_EXTRA = frozenset("‘’‚“”„–—…•†‡‰€™")


def escape_latex(text: str) -> str:
    """Escape *text* so it typesets literally in LaTeX text mode.

    Single pass over the characters so already-produced escapes are never escaped twice.
    """
    if not text:
        return ""
    text = _CONTROL_CHARS_RE.sub("", text)
    out: list[str] = []
    for char in text:
        special = _SPECIAL_CHARS.get(char)
        if special is not None:
            out.append(special)
            continue
        plain = _PLAIN_REPLACEMENTS.get(char)
        if plain is not None:
            out.append(plain)
            continue
        math = _MATH_SYMBOLS.get(char)
        if math is not None:
            out.append(math if not math.startswith("\\") else f"\\ensuremath{{{math}}}")
            continue
        out.append(char)
    return "".join(out)


def escape_url(url: str) -> str:
    r"""Escape a URL for use as the first argument of ``\href``."""
    url = _CONTROL_CHARS_RE.sub("", url).strip()
    return url.replace("\\", "/").replace("%", r"\%").replace("#", r"\#").replace("{", "%7B").replace("}", "%7D")


def needs_unicode_engine(latex: str) -> bool:
    """True when *latex* contains characters pdflatex cannot typeset (e.g. Vietnamese, Cyrillic, CJK)."""
    for char in latex:
        code = ord(char)
        if code <= 0x17F:
            continue
        if char in _PDFLATEX_SAFE_EXTRA:
            continue
        return True
    return False


_WHITESPACE_RE = re.compile(r"\s+")


def collapse_whitespace(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text.replace(" ", " ")).strip()
