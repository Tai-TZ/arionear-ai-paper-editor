"""Tests for defense PDF autolink helpers."""

from __future__ import annotations

from src.services.defense_citations import (
    autolink_defense_terms,
    extract_linkable_terms_from_latex,
    prepare_defense_council_markdown,
    sanitize_defense_pdf_links,
)

SAMPLE_LATEX = r"""
\title{Lightweight Adapters for Biomedical NER}
\section{Methods}
We use PubMedBERT as the backbone. Adapters are inserted with bottleneck dimension 64.
\section{Experiments}
EfficientNetV2 requires substantial GPU memory.
"""


def test_extract_terms_from_latex():
    terms = extract_linkable_terms_from_latex(SAMPLE_LATEX)
    assert "EfficientNetV2" in terms
    assert "PubMedBERT" in terms
    assert "Methods" in terms
    assert "Experiments" in terms


def test_autolink_model_name_gets_search_link():
    text = "Mô hình EfficientNetV2 cần nhiều tài nguyên."
    linked = autolink_defense_terms(text, extract_linkable_terms_from_latex(SAMPLE_LATEX))
    assert "[EfficientNetV2](#pdf?search=EfficientNetV2)" in linked


def test_autolink_vietnamese_phrase_gets_search_link():
    text = "Trong phần thí nghiệm, bạn đã nêu điều này."
    linked = prepare_defense_council_markdown(text, SAMPLE_LATEX)
    assert "#pdf?search=Experiments" in linked or "#pdf?search=Experimental" in linked


def test_skips_already_linked_terms():
    text = "Xem [EfficientNetV2](#pdf?search=EfficientNetV2) trong bài."
    linked = autolink_defense_terms(text, extract_linkable_terms_from_latex(SAMPLE_LATEX))
    assert linked.count("search=EfficientNetV2") == 1


def test_sanitize_strips_stopword_trong():
    text = "Bạn thực hiện [trong](#pdf?search=trong) bối cảnh này."
    result = sanitize_defense_pdf_links(text)
    assert "[trong](#pdf?search=trong)" not in result
    assert "trong" in result


def test_sanitize_normalises_passage_to_search():
    text = "Xem [phương pháp](#pdf?passage=methods) của bài."
    result = sanitize_defense_pdf_links(text)
    assert "search=methods" in result
    assert "passage=" not in result


def test_prepare_methodology_link_produces_search():
    text = "Trong phần [phương pháp](#pdf?search=Methodology), bạn đề cập data augmentation."
    linked = prepare_defense_council_markdown(text, SAMPLE_LATEX)
    # Should keep search=Methodology intact (valid term)
    assert "search=Methodology" in linked
