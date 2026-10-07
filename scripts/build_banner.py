#!/usr/bin/env python3
"""Build the README masthead banner (``docs/assets/banner.svg``).

The wordmark matches the app's ``ProoflineWordmark``: Playfair Display Black, tight tracking,
"Proof" in ink and "line" in the accent colour, on the light newsprint page like the landing masthead.
Text is converted to outlines (fontTools + HarfBuzz shaping), so GitHub renders the exact face
without loading fonts.

Usage:
    pip install fonttools uharfbuzz
    python scripts/build_banner.py

Playfair Display (SIL Open Font License 1.1) is downloaded once from github.com/google/fonts into
``.cache/fonts/``.
"""

from __future__ import annotations

import urllib.request
from html import escape
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets" / "banner.svg"
CACHE = ROOT / ".cache" / "fonts"
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/{}"
ROMAN, ITALIC = "PlayfairDisplay[wght].ttf", "PlayfairDisplay-Italic[wght].ttf"

W, H, M = 1040, 300, 40
INK, PAPER, RED = "#0A0A0A", "#F7F6F2", "#C9000C"  # app light tokens: ink · newsprint · editorial red
MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace"


def font_path(name: str) -> Path:
    path = CACHE / name
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        url = FONT_URL.format(name.replace("[", "%5B").replace("]", "%5D"))
        with urllib.request.urlopen(url, timeout=60) as resp:  # noqa: S310 — fixed https URL
            path.write_bytes(resp.read())
    return path


def instance(name: str, weight: int) -> tuple[TTFont, bytes]:
    """Static instance of the variable font at ``weight``, plus its bytes for HarfBuzz."""
    font = instantiateVariableFont(TTFont(font_path(name)), {"wght": weight})
    tmp = CACHE / f"{Path(name).stem}-{weight}.ttf"
    font.save(tmp)
    return TTFont(tmp), tmp.read_bytes()


def shape(blob: bytes, text: str, *, liga: bool = True) -> list[tuple[str, int, int]]:
    """HarfBuzz-shaped (glyph name, x advance, x offset) runs, kerning included."""
    face = hb.Face(blob)
    hb_font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, {"kern": True, "liga": liga})
    names = [hb_font.glyph_to_string(info.codepoint) for info in buf.glyph_infos]
    return [(n, pos.x_advance, pos.x_offset) for n, pos in zip(names, buf.glyph_positions, strict=True)]


def outline(
    font: TTFont,
    runs: list[tuple[str, int, int]],
    size: float,
    x: float,
    baseline: float,
    tracking_em: float = 0.0,
) -> tuple[list[str], float]:
    """SVG path data per glyph at the given size/position. Returns (paths, advance width in px)."""
    glyphs = font.getGlyphSet()
    scale = size / font["head"].unitsPerEm
    paths, pen_x = [], x
    for name, advance, offset in runs:
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, pen_x + offset * scale, baseline)))
        paths.append(pen.getCommands())
        pen_x += advance * scale + tracking_em * size
    return paths, pen_x - x


def text_width(font: TTFont, runs, size: float, tracking_em: float = 0.0) -> float:
    return outline(font, runs, size, 0, 0, tracking_em)[1]


def build() -> str:
    black, black_blob = instance(ROMAN, 900)
    italic, italic_blob = instance(ITALIC, 400)

    # Wordmark: one shaping pass so the "f|l" kerning across the colour split is kept; no "fl"
    # ligature, so glyphs map 1:1 to letters and the split stays after "Proof".
    size, track = 132, -0.04
    runs = shape(black_blob, "Proofline", liga=False)
    total = text_width(black, runs, size, track)
    paths, _ = outline(black, runs, size, (W - total) / 2, 190, track)
    proof, line = "".join(paths[:5]), "".join(paths[5:])

    tag_runs = shape(italic_blob, "Closer to Publication")
    tag_size = 30
    tag_w = text_width(italic, tag_runs, tag_size)
    tagline = "".join(outline(italic, tag_runs, tag_size, (W - tag_w) / 2, 240)[0])

    ticker = ("LATEX-NATIVE", "HUMAN-IN-THE-LOOP", "MULTI-LLM", "EN / VI")
    char_w = 13 * 0.72  # mono 13px + .12em tracking
    widths = [len(t) * char_w for t in ticker]
    tx = (W - (sum(widths) + 26 * (len(ticker) - 1))) / 2
    tick = []
    for i, (item, width) in enumerate(zip(ticker, widths, strict=True)):
        if i:
            tick.append(f'<path d="M {tx - 13:.1f} 277 l 5 5 l -5 5 l -5 -5 z" fill="{RED}"/>')
        tick.append(f'<text x="{tx:.1f}" y="287" class="m">{escape(item)}</text>')
        tx += width + 26

    label = "Proofline — Closer to Publication. AI-assisted LaTeX editor for scientific papers."
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        f'role="img" aria-label="{escape(label)}"><title>{escape(label)}</title>'
        f"<style>.m{{font-family:{MONO};font-size:13px;font-weight:700;letter-spacing:.12em;fill:{INK};"
        f"fill-opacity:.78}}</style>"
        f'<rect width="{W}" height="{H}" fill="{PAPER}"/>'
        f'<rect x=".75" y=".75" width="{W - 1.5}" height="{H - 1.5}" fill="none" stroke="{INK}" stroke-width="1.5"/>'
        f'<text x="{M}" y="38" class="m">VOL. I · NO. 01</text>'
        f'<text x="{W - M}" y="38" class="m" text-anchor="end">AI-ASSISTED LATEX EDITOR</text>'
        f'<path d="M {M} 52 H {W - M}" stroke="{INK}" stroke-opacity=".45"/>'
        f'<path d="{proof}" fill="{INK}"/><path d="{line}" fill="{RED}"/>'
        f'<path d="{tagline}" fill="{INK}" fill-opacity=".8"/>'
        f'<rect x="{M}" y="256" width="{W - 2 * M}" height="3" fill="{INK}"/>'
        f'<path d="M {M} 263.5 H {W - M}" stroke="{INK}" stroke-opacity=".7"/>'
        f"{''.join(tick)}</svg>\n"
    )


def main() -> int:
    OUT.write_text(build(), encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
