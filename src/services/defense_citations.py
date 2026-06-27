"""Auto-link defense council replies to PDF search terms."""
from __future__ import annotations

import re

_STOP_TERMS = frozenset({
    "trong", "cho", "của", "cua", "và", "va", "là", "la",
    "có", "co", "được", "duoc", "này", "nay", "đó", "do",
    "các", "cac", "một", "mot", "với", "voi", "từ", "tu",
    "khi", "như", "nhu", "về", "ve", "tại", "tai", "bạn",
    "ban", "tôi", "toi", "để", "de", "hoặc", "hoac", "hay",
    "cũng", "cung", "đã", "da", "sẽ", "se", "những", "nhung",
    "gì", "gi", "không", "khong", "còn", "con",
    "the", "and", "for", "with", "from", "this", "that",
    "using", "use", "used", "paper", "section", "figure",
    "table", "abstract", "introduction", "conclusion", "chapter",
    "in", "on", "at", "to", "of", "by", "an", "or", "as",
    "is", "are", "was", "be", "been", "it", "its", "we", "you", "your",
})

_VI_PHRASE_RULES: tuple[tuple[re.Pattern[str], tuple[str, ...]], ...] = (
    (re.compile(r"\bphần thí nghiệm\b", re.I), ("Experiments", "Experimental", "Results")),
    (re.compile(r"\bphương pháp(?: nghiên cứu)?\b", re.I), ("Methodology", "Methods", "Approach")),
    (re.compile(r"\bkết quả\b", re.I), ("Results", "Findings")),
    (re.compile(r"\bphần giới thiệu\b", re.I), ("Introduction",)),
    (re.compile(r"\bphần kết luận\b", re.I), ("Conclusion",)),
)

_PDF_LINK_RE = re.compile(r"\[([^\]]+)\]\(#pdf\?([^)]*)\)")


def is_valid_pdf_citation_search(search: str) -> bool:
    normalized = search.strip().lower()
    if not normalized or normalized in _STOP_TERMS or len(normalized) < 4:
        return False
    has_upper = any(c.isupper() for c in search)
    has_hyphen = "-" in search
    is_multi_word = len(normalized.split()) >= 2
    if not has_upper and not has_hyphen and not is_multi_word and len(normalized) < 6:
        return False
    return True


def sanitize_defense_pdf_links(content: str) -> str:
    """Strip or normalise invalid #pdf? links the model might emit."""
    def _replace(match: re.Match[str]) -> str:
        label = match.group(1)
        raw_params = match.group(2)
        params: dict[str, str] = {}
        for part in raw_params.split("&"):
            if "=" in part:
                k, _, v = part.partition("=")
                params[k.strip()] = v.strip()

        # Normalise passage= to search= so downstream stays simple
        search = params.get("search") or params.get("passage") or ""
        search = search.strip()
        if not search or not is_valid_pdf_citation_search(search):
            return label
        page_part = f"&page={params['page']}" if "page" in params else ""
        return f"[{label}](#pdf?search={search}{page_part})"

    return _PDF_LINK_RE.sub(_replace, content)


def _clean_latex_fragment(raw: str) -> str:
    text = re.sub(r"\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?", " ", raw)
    text = re.sub(r"[{}\\$]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_linkable_terms_from_latex(latex: str) -> list[str]:
    if not latex.strip():
        return []
    terms: set[str] = set()
    for pattern in (
        re.compile(r"\\(?:section|subsection|subsubsection|chapter)\*?\{([^}]+)\}", re.I),
        re.compile(r"\\(?:textbf|emph|textit)\{([^}]+)\}", re.I),
    ):
        for match in pattern.finditer(latex):
            cleaned = _clean_latex_fragment(match.group(1))
            if 3 <= len(cleaned) <= 80:
                terms.add(cleaned)

    for match in re.finditer(r"\b[A-Za-z][A-Za-z0-9]*(?:[A-Z][a-zA-Z0-9]*)+\b", latex):
        if len(match.group(0)) >= 4:
            terms.add(match.group(0))

    for match in re.finditer(
        r"\b(?:EfficientNet(?:V2)?|PubMedBERT|BioBERT|BERT|adapter(?:s)?|bottleneck|"
        r"macro[- ]?F1|F1[- ]?score|transformer(?:s)?|NER|Biomedical)\b",
        latex,
        re.I,
    ):
        terms.add(match.group(0))

    return sorted(
        (t for t in terms if t.lower() not in _STOP_TERMS and is_valid_pdf_citation_search(t)),
        key=len,
        reverse=True,
    )


def _already_linked(text: str, search: str) -> bool:
    return f"search={search.lower()}" in text.lower()


def autolink_defense_terms(content: str, latex_terms: list[str]) -> str:
    if not content.strip() or not latex_terms:
        return content

    out = content
    for term in latex_terms:
        if len(term) < 3 or not is_valid_pdf_citation_search(term) or _already_linked(out, term):
            continue
        pattern = re.compile(rf"(?<!\[)\b({re.escape(term)})\b(?![^\[]*\]\()", re.I)
        if pattern.search(out):
            out = pattern.sub(
                lambda m: f"[{m.group(1)}](#pdf?search={term})",
                out,
                count=1,
            )

    for phrase_re, candidates in _VI_PHRASE_RULES:
        search = next((c for c in candidates if is_valid_pdf_citation_search(c)), None)
        if not search or _already_linked(out, search):
            continue
        if phrase_re.search(out):
            out = phrase_re.sub(
                lambda m, s=search: f"[{m.group(0)}](#pdf?search={s})",
                out,
                count=1,
            )

    return out


def prepare_defense_council_markdown(content: str, latex: str) -> str:
    sanitized = sanitize_defense_pdf_links(content)
    return autolink_defense_terms(sanitized, extract_linkable_terms_from_latex(latex))
