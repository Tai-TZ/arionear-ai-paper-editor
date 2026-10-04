"""Claim-context extraction around \\cite / \\citep / \\citet (Citation Layer 4)."""

from __future__ import annotations

from src.services.citations.claim_context import (
    clean_claim_snippet,
    extract_claim_contexts,
    split_cite_keys,
)


def _doc(body: str) -> str:
    return "\\documentclass{article}\n\\begin{document}\n" + body + "\n\\end{document}\n"


def test_single_key_returns_containing_sentence():
    latex = _doc(
        "Prior work studied CNNs. Residual connections ease optimisation of deep networks~\\cite{he2016}. "
        "We extend this idea."
    )
    contexts = extract_claim_contexts(latex)
    assert contexts == {"he2016": ["Residual connections ease optimisation of deep networks [he2016]."]}


def test_multi_key_cite_gives_each_key_the_shared_claim():
    latex = _doc("Transformers dominate language modelling \\cite{vaswani2017, devlin2019}.")
    contexts = extract_claim_contexts(latex)
    expected = "Transformers dominate language modelling [vaswani2017, devlin2019]."
    assert contexts["vaswani2017"] == [expected]
    assert contexts["devlin2019"] == [expected]


def test_citep_citet_optional_args_and_starred_variants():
    latex = _doc(
        "\\citet{smith2020} showed that pruning preserves accuracy on ImageNet. "
        "Sparse models are cheaper to serve \\citep[see][p.~5]{lee2021}. "
        "Quantisation helps as well \\citep*{wu2022}."
    )
    contexts = extract_claim_contexts(latex)
    assert contexts["smith2020"] == ["[smith2020] showed that pruning preserves accuracy on ImageNet."]
    assert contexts["lee2021"] == ["Sparse models are cheaper to serve [lee2021]."]
    assert contexts["wu2022"] == ["Quantisation helps as well [wu2022]."]


def test_multiple_occurrences_in_document_order_deduplicated_and_capped():
    latex = _doc(
        "Graph networks model molecules well \\cite{gilmer2017}.\n\n"
        "Message passing generalises convolutions to graphs \\cite{gilmer2017}.\n\n"
        "Graph networks model molecules well \\cite{gilmer2017}.\n\n"
        "They also predict quantum properties accurately \\cite{gilmer2017}.\n\n"
        "And they scale to large datasets of crystals \\cite{gilmer2017}."
    )
    contexts = extract_claim_contexts(latex, max_per_key=3)
    assert contexts["gilmer2017"] == [
        "Graph networks model molecules well [gilmer2017].",
        "Message passing generalises convolutions to graphs [gilmer2017].",
        "They also predict quantum properties accurately [gilmer2017].",
    ]


def test_requested_keys_filter_and_missing_key_is_empty():
    latex = _doc("Dropout reduces overfitting in neural networks \\cite{srivastava2014}. Other \\cite{other}.")
    contexts = extract_claim_contexts(latex, ["srivastava2014", "never_cited"])
    assert set(contexts) == {"srivastava2014", "never_cited"}
    assert contexts["never_cited"] == []
    assert "Dropout reduces overfitting" in contexts["srivastava2014"][0]


def test_abbreviations_and_decimals_do_not_split_sentences():
    latex = _doc(
        "As reported by Smith et al. \\cite{smith}, accuracy improves by 3.5\\% on CIFAR-10, "
        "e.g. for ResNet-50 models trained with Fig.~2 settings."
    )
    snippet = extract_claim_contexts(latex)["smith"][0]
    assert snippet.startswith("As reported by Smith et al. [smith]")
    assert "3.5% on CIFAR-10" in snippet
    assert snippet.endswith("Fig. 2 settings.")


def test_short_sentence_pulls_in_previous_sentence():
    latex = _doc("Batch normalisation stabilises training of very deep networks. See \\cite{ioffe2015}.")
    snippet = extract_claim_contexts(latex)["ioffe2015"][0]
    assert snippet == "Batch normalisation stabilises training of very deep networks. See [ioffe2015]."


def test_paragraph_section_and_item_boundaries():
    latex = _doc(
        "An unrelated closing paragraph without a full stop\n\n"
        "\\section{Related Work}\n"
        "Attention mechanisms were first used for alignment in translation \\cite{bahdanau2015}\n"
        "\\begin{itemize}\n"
        "\\item Contrastive learning yields strong representations \\cite{chen2020}\n"
        "\\item Another item\n"
        "\\end{itemize}"
    )
    contexts = extract_claim_contexts(latex)
    assert contexts["bahdanau2015"] == [
        "Attention mechanisms were first used for alignment in translation [bahdanau2015]"
    ]
    assert contexts["chen2020"] == ["Contrastive learning yields strong representations [chen2020]"]


def test_comments_nocite_preamble_and_bibliography_are_ignored():
    latex = (
        "\\documentclass{article}\n"
        "\\title{About \\cite{preamble}}\n"
        "\\begin{document}\n"
        "% An old claim \\cite{commented}\n"
        "Kept claim about optimisation of networks \\cite{kept}. 50\\% \\nocite{*}\n"
        "\\begin{thebibliography}{9}\\bibitem{kept} K. Author. \\cite{inbib}\\end{thebibliography}\n"
        "\\end{document}\n"
    )
    contexts = extract_claim_contexts(latex)
    assert set(contexts) == {"kept"}


def test_long_sentence_is_windowed_around_cite():
    filler = " ".join(f"word{i}" for i in range(300))
    latex = _doc(f"{filler} crucial claim \\cite{{target}} {filler}.")
    snippet = extract_claim_contexts(latex, max_chars=200)["target"][0]
    assert "crucial claim [target]" in snippet
    assert snippet.startswith("…") and snippet.endswith("…")
    assert len(snippet) < 260


def test_empty_or_citeless_documents():
    assert extract_claim_contexts("") == {}
    assert extract_claim_contexts(_doc("No citations here.")) == {}
    assert extract_claim_contexts("", ["a"]) == {"a": []}


def test_clean_snippet_and_split_keys():
    raw = "We \\emph{greatly} improve~results \\label{x} (see Table~\\ref{tab:1}) \\citep{a,b}"
    assert clean_claim_snippet(raw) == "We greatly improve results (see Table [ref]) [a, b]"
    assert split_cite_keys(" a, b ,a,, c ") == ["a", "b", "c"]
