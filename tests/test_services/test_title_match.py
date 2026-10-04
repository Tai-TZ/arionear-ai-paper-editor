"""Citation title matching: LaTeX-aware normalization + fuzzy match, no substring containment."""

from __future__ import annotations

import httpx
import pytest

from src.services.citations import openalex
from src.services.citations.sources import fetch_source_text
from src.services.citations.verifier import _normalize_title, _title_match

_REAL_ASYNC_CLIENT = httpx.AsyncClient


def test_normalize_title_turns_latex_into_plain_words():
    assert _normalize_title(r"{BERT}: Pre-training of {D}eep \emph{Nets}") == "bert pre training of deep nets"
    assert _normalize_title(r"M{\"u}ller's  {\'E}tude") == "muller s etude"
    assert _normalize_title("Attention Is All You Need.") == "attention is all you need"


def test_normalize_title_keeps_text_after_a_literal_percent():
    assert _normalize_title(r"5% fewer {GPU} hours") == "5 fewer gpu hours"


# --- reproduced bugs ---------------------------------------------------------------------------


def test_prefix_is_not_the_same_title():
    assert _title_match("Attention", "Attention Is All You Need") is False
    assert _title_match("Attention Is All You Need", "Attention") is False


def test_bibtex_braces_do_not_break_a_match():
    bib = r"{BERT}: Pre-training of Deep Bidirectional Transformers for Language Understanding"
    api = "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding"
    assert _title_match(bib, api) is True


# --- true positives / negatives ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("a", "b"),
    [
        ("Attention is all you need", "Attention Is All You Need."),
        ("{Attention} Is All You Need", "Attention is all you need"),
        (r"M{\"u}ller's analysis of networks", "Müller's Analysis of Networks"),
        (r"M{\"u}ller's analysis of networks", "Muller's analysis of networks"),
        ("Attention Is All You Need", "Attention Is Al You Need"),
        ("Attention: is all you need!", "Attention Is All You Need"),
        ("Generative Adversarial Nets", "Generative Adversarial Networks"),
        (r"The $\alpha$-divergence of {GANs}", "The α-divergence of GANs"),
    ],
)
def test_same_title_with_cosmetic_differences_matches(a, b):
    assert _title_match(a, b) is True


@pytest.mark.parametrize(
    ("a", "b"),
    [
        ("Deep learning", "Deep learning for vision"),
        ("Graph Attention Networks", "Graph Attention Networks: A Survey"),
        ("Deep Residual Learning for Image Recognition", "Identity Mappings in Deep Residual Networks"),
        ("Language Models are Few-Shot Learners", "Language Models are Unsupervised Multitask Learners"),
        ("Deep Residual Learning for Image Recognition", "Deep Residual Learning for Image Classification"),
        ("", "Attention Is All You Need"),
        ("Attention Is All You Need", ""),
        ("{}", "--"),
    ],
)
def test_different_titles_do_not_match(a, b):
    assert _title_match(a, b) is False


# --- effect on abstract lookup (Citation L4) ---------------------------------------------------


def _install_openalex(monkeypatch, results: list[dict]) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.openalex.org":
            return httpx.Response(200, json={"results": results})
        return httpx.Response(200, json={"data": []})

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return _REAL_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(openalex.httpx, "AsyncClient", factory)


def _work(title: str, abstract: str) -> dict:
    index = {word: [i] for i, word in enumerate(abstract.split())}
    return {"id": "https://openalex.org/W1", "title": title, "abstract_inverted_index": index}


@pytest.mark.asyncio
async def test_prefix_titled_work_does_not_lend_its_abstract(monkeypatch):
    _install_openalex(monkeypatch, [_work("Attention", "Unrelated psychology abstract.")])
    source = await fetch_source_text({"key": "v", "title": "Attention Is All You Need", "raw": ""})
    assert source.abstract == ""


@pytest.mark.asyncio
async def test_braced_bib_title_finds_its_abstract(monkeypatch):
    _install_openalex(monkeypatch, [_work("Attention is all you need", "Transformers use attention only.")])
    source = await fetch_source_text({"key": "v", "title": "{Attention} Is All You Need", "raw": ""})
    assert (source.abstract, source.source) == ("Transformers use attention only.", "openalex")
