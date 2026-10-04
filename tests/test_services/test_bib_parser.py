"""``parse_bib_entries``: the dict shape callers rely on, plus the brace / ``@`` / bare-value cases."""

from __future__ import annotations

import logging

from src.services.citations.verifier import entry_identifiers
from src.services.parser.latex import extract_bib_content, parse_bib_entries

_ENTRY_KEYS = {"key", "type", "title", "author", "year", "doi", "eprint", "journal", "raw"}

_NORMAL_BIB = r"""
@inproceedings{ vaswani2017 ,
  title={Attention Is All You Need},
  author={Vaswani, Ashish and Shazeer, Noam},
  booktitle={NeurIPS},
  year={2017},
  eprint={1706.03762}
}

@ARTICLE{he2016,
  TITLE = "Deep Residual Learning for Image Recognition",
  Journal = "CVPR",
  Year = "2016",
  DOI = {10.1109/cvpr.2016.90}
}
"""


# --- characterization: behaviour callers depend on --------------------------------------------


def test_empty_or_blank_input_returns_no_entries():
    assert parse_bib_entries("") == {}
    assert parse_bib_entries("  \n\t ") == {}


def test_normal_entries_keep_the_dict_shape():
    entries = parse_bib_entries(_NORMAL_BIB)
    assert list(entries) == ["vaswani2017", "he2016"]
    for entry in entries.values():
        assert set(entry) == _ENTRY_KEYS

    vaswani = entries["vaswani2017"]
    assert vaswani["key"] == "vaswani2017"
    assert vaswani["type"] == "inproceedings"
    assert vaswani["title"] == "Attention Is All You Need"
    assert vaswani["author"] == "Vaswani, Ashish and Shazeer, Noam"
    assert vaswani["year"] == "2017"
    assert vaswani["eprint"] == "1706.03762"
    assert vaswani["doi"] == ""
    assert vaswani["journal"] == ""


def test_type_and_field_names_are_case_insensitive_and_quotes_are_stripped():
    he = parse_bib_entries(_NORMAL_BIB)["he2016"]
    assert he["type"] == "article"
    assert he["title"] == "Deep Residual Learning for Image Recognition"
    assert he["journal"] == "CVPR"
    assert he["year"] == "2016"
    assert he["doi"] == "10.1109/cvpr.2016.90"


def test_raw_is_the_entry_body_after_the_key():
    raw = parse_bib_entries(_NORMAL_BIB)["vaswani2017"]["raw"]
    assert raw.startswith("title={Attention Is All You Need},")
    assert "eprint={1706.03762}" in raw
    assert "vaswani2017" not in raw
    assert "@inproceedings" not in raw


def test_missing_fields_are_empty_strings():
    entry = parse_bib_entries("@misc{bare, title={Only a title}}")["bare"]
    assert entry["title"] == "Only a title"
    assert (entry["author"], entry["year"], entry["doi"], entry["eprint"], entry["journal"]) == ("", "", "", "", "")


def test_duplicate_keys_keep_the_last_entry():
    bib = "@article{dup, title={First}, year={2001}}\n@article{dup, title={Second}, year={2002}}"
    entry = parse_bib_entries(bib)["dup"]
    assert (entry["title"], entry["year"]) == ("Second", "2002")


def test_duplicate_fields_keep_the_last_value():
    entry = parse_bib_entries('@article{d, title={A}, title={B}, year="1999"}')["d"]
    assert (entry["title"], entry["year"]) == ("B", "1999")


def test_inline_thebibliography_has_no_bibtex_entries():
    latex = r"\begin{thebibliography}{9}\bibitem{a} A. Author. Title. 2020.\end{thebibliography}"
    assert parse_bib_entries(extract_bib_content(latex)) == {}


# --- reproduced bugs of the old regex parser ---------------------------------------------------

_BUGGY_BIB = r"""
@article{devlin2019,
  title = {{BERT}: Pre-training of Deep Bidirectional Transformers},
  author = {M{\"u}ller, Hans and Devlin, Jacob},
  year = 2019,
  url = {https://example.org/user@host/paper},
  doi = {10.18653/v1/N19-1423},
  journal = "Proc. NAACL"
}

@book{after2020, title={After}, year={2020}}
"""


def test_nested_braces_in_title_strip_only_the_outer_delimiters():
    assert (
        parse_bib_entries(_BUGGY_BIB)["devlin2019"]["title"]
        == "{BERT}: Pre-training of Deep Bidirectional Transformers"
    )


def test_accent_macros_in_author_are_kept_whole():
    assert parse_bib_entries(_BUGGY_BIB)["devlin2019"]["author"] == r"M{\"u}ller, Hans and Devlin, Jacob"


def test_bare_numeric_year_is_read():
    assert parse_bib_entries(_BUGGY_BIB)["devlin2019"]["year"] == "2019"


def test_at_sign_inside_a_field_does_not_truncate_the_entry():
    entries = parse_bib_entries(_BUGGY_BIB)
    devlin = entries["devlin2019"]
    assert devlin["doi"] == "10.18653/v1/N19-1423"
    assert devlin["journal"] == "Proc. NAACL"
    assert "doi = {10.18653/v1/N19-1423}" in devlin["raw"]
    assert entry_identifiers(devlin) == ("10.18653/v1/N19-1423", "")
    assert entries["after2020"]["title"] == "After"
    assert "user@host" not in entries


def test_string_macros_are_resolved_and_comments_are_not_entries():
    bib = '@string{jml = "Journal of Machine Learning"}\n@comment{not, an entry}\n@article{s, journal = jml, title={T}}'
    entries = parse_bib_entries(bib)
    assert list(entries) == ["s"]
    assert entries["s"]["journal"] == "Journal of Machine Learning"


def test_malformed_block_is_skipped_and_logged(caplog):
    bib = "@misc{broken,\n  title = {Unclosed\n@book{ok, title={Fine}, year={2021}}"
    with caplog.at_level(logging.DEBUG, logger="src.services.parser.latex"):
        entries = parse_bib_entries(bib)
    assert entries["ok"]["title"] == "Fine"
    assert "broken" not in entries
    assert any("1 BibTeX block" in record.getMessage() for record in caplog.records)
