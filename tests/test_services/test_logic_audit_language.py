from src.services.logic_audit.language import clean_section_display_name, resolve_audit_language


def test_resolve_audit_language_vietnamese_query():
    assert resolve_audit_language("Kiểm tra logic bài báo") == "Vietnamese"


def test_resolve_audit_language_english_query():
    assert resolve_audit_language("Run logic audit on claim consistency") == "English"


def test_resolve_audit_language_default():
    assert resolve_audit_language("") == "Vietnamese"


def test_clean_section_display_name_strips_latex():
    assert clean_section_display_name("\\textbf{Introduction}") == "Introduction"
    assert clean_section_display_name("\\TEXTBFFACE{INTRODUCTION}") == "INTRODUCTION"
    assert clean_section_display_name("\\section{\\textbf{Methods}}") == "Methods"
