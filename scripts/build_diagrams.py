#!/usr/bin/env python3
"""Build the animated isometric SVG diagrams embedded in README.md and ARCHITECTURE.md.

Every diagram is generated from the declarative definitions below, so layout tweaks
stay consistent across all of them. Output goes to ``docs/assets/*.svg``.

Usage:
    python scripts/build_diagrams.py            # build every diagram
    python scripts/build_diagrams.py sequence   # build only the named diagram(s)

Visual identity follows the app's editorial "newsprint" design (``frontend/src/styles.css``):
newsprint paper, ink line-art blocks, editorial red for the live flow, square corners, hard
offset shadows, Playfair / Source Serif / JetBrains Mono type stacks. Colours are CSS custom
properties holding the app's light tokens; the diagrams always render on newsprint, also on
GitHub's dark theme (like a printed figure). The SVGs are self-contained (no external
fonts/scripts) and animate with CSS + SMIL; ``prefers-reduced-motion`` stops the motion and
hides the moving packets. Text sizes assume the ~880px README column: nothing is set below 14px
on the 1040px canvas (~12px on screen).
"""

from __future__ import annotations

import math
import re
import sys
from dataclasses import dataclass
from html import escape
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "docs" / "assets"

ISO = math.tan(math.radians(30))  # vertical / horizontal ratio of an isometric top face
W = 1040  # canvas width
M = 40  # outer margin
GUTTER = M + 44  # content starts here when lanes carry a rotated label in the left gutter

DISPLAY = "'Playfair Display', Georgia, 'Times New Roman', serif"
SERIF = "'Source Serif 4', 'Source Serif Pro', Georgia, 'Times New Roman', serif"
# Georgia has no precomposed Vietnamese glyphs, so Vietnamese text skips it.
DISPLAY_VI = "'Playfair Display', 'Noto Serif Display', 'Noto Serif', 'Times New Roman', Times, serif"
SERIF_VI = "'Source Serif 4', 'Noto Serif', 'Times New Roman', Times, serif"
MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace"
SANS = "Inter, 'Helvetica Neue', Arial, sans-serif"
VI_TEXT = re.compile(r"[À-ɏḀ-ỿ]")

# App tokens (frontend/src/styles.css), oklch converted to the sRGB hex the browser renders.
# light: newsprint oklch(.973 .005 90) · ink oklch(.145 0 0) · red oklch(.52 .22 27) · divider oklch(.91 .003 90)
LIGHT = {
    "pp": "#F7F6F2",  # newsprint (page)
    "ik": "#0A0A0A",  # ink
    "rd": "#C9000C",  # editorial red
    "mu": "#555555",  # muted foreground
    "tp": "#FEFDFB",  # block top face (hero surface)
    "fl": "#E2E1DF",  # block left face (divider)
    "fr": "#C9C7C1",  # block right face
    "on": "#F7F6F2",  # text on red / ink
}


def _vars(tokens: dict[str, str]) -> str:
    return ";".join(f"--{k}:{v}" for k, v in tokens.items())


CSS = (
    f":root{{{_vars(LIGHT)}}}"
    f".d{{font-family:{DISPLAY}}}.dv{{font-family:{DISPLAY_VI}}}.s{{font-family:{SERIF}}}"
    f".sv{{font-family:{SERIF_VI}}}.m{{font-family:{MONO}}}.u{{font-family:{SANS}}}"
    ".k{letter-spacing:.12em}"
    ".i{fill:var(--ik)}.p{fill:var(--pp)}.r{fill:var(--rd)}.q{fill:var(--mu)}"
    ".t{fill:var(--tp)}.L{fill:var(--fl)}.R{fill:var(--fr)}.o{fill:var(--on)}"
    ".e{stroke:var(--ik);stroke-width:1.3;stroke-linejoin:round}"
    ".h{paint-order:stroke;stroke:var(--pp);stroke-width:5px;stroke-linejoin:round}"
    ".ln{fill:none;stroke:var(--ik)}"
    ".sh{fill:var(--ik);fill-opacity:.18}"
    ".tk{fill:none;stroke:var(--ik);stroke-opacity:.42;stroke-width:1.3}"
    ".dt{fill:none;stroke:var(--ik);stroke-opacity:.6;stroke-width:1.3;stroke-dasharray:2 5;stroke-linecap:round}"
    ".fw{fill:none;stroke:var(--rd);stroke-width:2;stroke-dasharray:6 10;animation:fw 1.4s linear infinite}"
    "@keyframes fw{to{stroke-dashoffset:-32}}"
    ".pl{fill:none;stroke:var(--rd);stroke-width:1.6;transform-box:fill-box;transform-origin:center;"
    "animation:pl 2.8s ease-out infinite}"
    "@keyframes pl{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.35)}}"
    "@media (prefers-reduced-motion:reduce){.fw,.pl{animation:none}.pl{opacity:.5}.pk{display:none}}"
)


def pts(*points: tuple[float, float]) -> str:
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


def mono_w(s: str, size: float = 14, spaced: bool = False) -> float:
    """Approximate rendered width of monospace text (JetBrains Mono / Consolas fallbacks)."""
    return len(s) * size * (0.6 + (0.12 if spaced else 0))


def cols(n: int, x0: float = GUTTER, x1: float = W - M) -> list[float]:
    """Centres of ``n`` equal columns between x0 and x1."""
    step = (x1 - x0) / n
    return [x0 + step * (i + 0.5) for i in range(n)]


@dataclass(frozen=True)
class Box:
    """Geometry of an isometric block: (x, cy) is the centre of its top face."""

    x: float
    cy: float
    hw: float
    bh: float

    @property
    def hh(self) -> float:
        return self.hw * ISO

    @property
    def top(self) -> tuple[float, float]:
        return self.x, self.cy - self.hh

    @property
    def bottom(self) -> tuple[float, float]:
        return self.x, self.cy + self.hh + self.bh

    @property
    def left(self) -> tuple[float, float]:
        return self.x - self.hw, self.cy + self.bh / 2

    @property
    def right(self) -> tuple[float, float]:
        return self.x + self.hw, self.cy + self.bh / 2


class Diagram:
    """Collects SVG fragments in z-ordered layers and writes the final file.

    Every figure shares the same newspaper furniture: masthead line (desk + FIG. number), red
    kicker tag with the source reference, Playfair headline, italic deck, thick+thin double rule,
    and an optional ink ticker band along the bottom edge.
    """

    LAYERS = ("bg", "lanes", "edges", "blocks", "packets", "labels")

    def __init__(
        self,
        name: str,
        height: int,
        *,
        title: str,
        deck: str,
        desk: str,
        fig: str,
        kicker: str,
        source: str = "",
        ticker: tuple[str, ...] = (),
        aria: str = "",
    ) -> None:
        self.name, self.w, self.h = name, W, height
        self.aria = aria or f"{title}. {deck}"
        self.defs: list[str] = []
        self.layers: dict[str, list[str]] = {k: [] for k in self.LAYERS}
        self._header(title, deck, desk, fig, kicker, source)
        if ticker:
            self._ticker(ticker)

    # ---- primitives ---------------------------------------------------------
    def add(self, layer: str, fragment: str) -> None:
        self.layers[layer].append(fragment)

    def text(
        self, x, y, s, *, size=14, cls="u i", anchor="start", weight=None, italic=False, halo=False, layer="labels"
    ) -> None:
        if VI_TEXT.search(s):  # Georgia / Consolas lack precomposed Vietnamese glyphs
            cls = " ".join({"s": "sv", "d": "dv", "m": "u"}.get(c, c) for c in cls.split())
        attrs = f'x="{x:.1f}" y="{y:.1f}" class="{cls}{" h" if halo else ""}" font-size="{size}"'
        if anchor != "start":
            attrs += f' text-anchor="{anchor}"'
        if weight:
            attrs += f' font-weight="{weight}"'
        if italic:
            attrs += ' font-style="italic"'
        self.add(layer, f"<text {attrs}>{escape(s)}</text>")

    def line(self, x1, y1, x2, y2, *, width=1.0, opacity=None, layer="bg") -> None:
        extra = f' stroke-opacity="{opacity}"' if opacity is not None else ""
        self.add(
            layer,
            f'<path d="M {x1:.1f} {y1:.1f} L {x2:.1f} {y2:.1f}" class="ln" stroke-width="{width}"{extra}/>',
        )

    def tag(self, x, y, label, *, red=True, layer="bg", h=26) -> float:
        """Solid tag label (the site's red "BREAKING" box). Returns its width."""
        w = mono_w(label, 14, spaced=True) + 18
        self.add(layer, f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h}" class="{"r" if red else "i"}"/>')
        self.text(x + 10, y + h / 2 + 5, label, cls="m k o", weight=700, layer=layer)
        return w

    def _header(self, title, deck, desk, fig, kicker, source) -> None:
        w, h = self.w, self.h
        self.defs += [
            '<pattern id="dots" width="4" height="4" patternUnits="userSpaceOnUse">'
            '<path d="M1 3h1v1H1zM3 1h1v1H3z" class="i" fill-opacity=".05"/></pattern>',
            '<pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse">'
            '<path d="M1 0V4" class="ln" stroke-width=".8" stroke-opacity=".26"/></pattern>',
            '<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" '
            'markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" class="i"/></marker>',
        ]
        self.add(
            "bg",
            f'<rect width="{w}" height="{h}" class="p"/><rect width="{w}" height="{h}" fill="url(#dots)"/>'
            f'<rect x=".75" y=".75" width="{w - 1.5}" height="{h - 1.5}" class="ln" stroke-width="1.5"/>',
        )
        self.text(M, 38, f"ARIONEAR · {desk}", cls="m k i", weight=700, layer="bg")
        self.text(w - M, 38, f"FIG. {fig}", cls="m k r", weight=700, anchor="end", layer="bg")
        self.line(M, 50, w - M, 50)
        tw = self.tag(M, 66, kicker)
        if source:
            self.text(M + tw + 14, 84, source, cls="m q", layer="bg")
        self.text(M, 140, title, size=42, cls="d i", weight=700, layer="bg")
        self.text(M, 172, deck, size=18, cls="s q", italic=True, layer="bg")
        self.add("bg", f'<rect x="{M}" y="188" width="{w - 2 * M}" height="3" class="i"/>')
        self.line(M, 196, w - M, 196)

    def _ticker(self, items: tuple[str, ...]) -> None:
        y0 = self.h - 40
        self.add("bg", f'<rect x="0" y="{y0}" width="{self.w}" height="40" class="i"/>')
        x = M
        for i, item in enumerate(items):
            if i:
                self.add("bg", f'<path d="M {x + 2:.1f} {y0 + 14} l 6 6 l -6 6 l -6 -6 z" class="r"/>')
                x += 20
            self.text(x, y0 + 25, item, cls="m k o", weight=700, layer="bg")
            x += mono_w(item, 14, spaced=True) + 10

    # ---- building blocks ----------------------------------------------------
    def lane(self, top, bottom, number, name, caption="", *, tint=False, x0=M, x1=None) -> None:
        """Newspaper section band: rule on top, red number, mono name, italic caption."""
        x1 = self.w - M if x1 is None else x1
        if tint:
            self.add(
                "lanes",
                f'<rect x="{x0}" y="{top}" width="{x1 - x0}" height="{bottom - top}" class="i" fill-opacity=".035"/>',
            )
        self.line(x0, top, x1, top, width=1.3, layer="lanes")
        self.text(x0 + 10, top + 23, number, cls="m r", weight=700, layer="lanes")
        nx = x0 + 10 + mono_w(number) + 12
        self.text(nx, top + 23, name, cls="m k i", weight=700, layer="lanes")
        if caption:
            cx = nx + mono_w(name, 14, spaced=True) + 8
            self.text(cx, top + 23, f"— {caption}", size=15, cls="s q", italic=True, layer="lanes")

    def glane(self, top, bottom, number, name, *, tint=False) -> None:
        """Lane whose label reads bottom-to-top in the left gutter, so vertical edges never cross it."""
        x1 = self.w - M
        if tint:
            self.add(
                "lanes",
                f'<rect x="{M}" y="{top}" width="{x1 - M}" height="{bottom - top}" class="i" fill-opacity=".035"/>',
            )
        self.line(M, top, x1, top, width=1.3, layer="lanes")
        self.line(M + 32, top + 8, M + 32, bottom - 8, opacity=0.35, layer="lanes")
        self.add(
            "lanes",
            f'<g transform="translate({M + 21} {(top + bottom) / 2:.1f}) rotate(-90)"><text x="0" y="0" '
            f'text-anchor="middle" class="m k i" font-size="14" font-weight="700"><tspan class="r">{number}</tspan> '
            f"{escape(name)}</text></g>",
        )

    def panel(self, x, y, w, h, title, caption=None, *, red=False) -> None:
        self.add("lanes", f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="ln" stroke-width="1.3"/>')
        tw = self.tag(x, y, title, red=red, layer="lanes", h=24)
        if caption:
            self.text(x + tw + 10, y + 17, caption, size=14, cls="s q", italic=True, layer="lanes")

    def edge(self, d, *, arrow=True, flow=True, dotted=False, label=None, at=None, anchor="middle") -> None:
        marker = ' marker-end="url(#ah)"' if arrow else ""
        if dotted:
            self.add("edges", f'<path d="{d}" class="dt"{marker}/>')
        else:
            self.add("edges", f'<path d="{d}" class="tk"{marker}/>')
            if flow:
                self.add("edges", f'<path d="{d}" class="fw"/>')
        if label and at:
            self.text(*at, label, cls="m q", anchor=anchor, halo=True)

    def drops(self, y, boxes, *, x_from=None, x_to=None, gap=8) -> None:
        """Horizontal bus at ``y`` with an arrow dropping into the top of every box."""
        xs = [b.x for b in boxes]
        x0 = min(xs) if x_from is None else x_from
        x1 = max(xs) if x_to is None else x_to
        self.edge(f"M {x0:.1f} {y:.1f} H {x1:.1f}", arrow=False)
        for b in boxes:
            self.edge(f"M {b.x:.1f} {y:.1f} V {b.top[1] - gap:.1f}", flow=False)

    def link(self, a: Box, b: Box, *, y=None, **kw) -> None:
        """Straight horizontal arrow between two blocks on the same row (either direction)."""
        if b.x > a.x:
            x1, x2 = a.right[0] + 8, b.left[0] - 10
        else:
            x1, x2 = a.left[0] - 8, b.right[0] + 10
        yy = a.right[1] if y is None else y
        if "label" in kw and "at" not in kw:
            kw["at"] = ((x1 + x2) / 2, yy - 11)
        self.edge(f"M {x1:.1f} {yy:.1f} H {x2:.1f}", **kw)

    def packet(self, path, dur, begin=0.0, *, key_points=None, key_times=None, fade=True, size=5.5) -> None:
        motion = f'dur="{dur}s" begin="{begin}s" repeatCount="indefinite" path="{path}"'
        if key_points:
            motion += f' keyPoints="{key_points}" keyTimes="{key_times}" calcMode="linear"'
        anim = f"<animateMotion {motion}/>"
        if fade:
            anim += (
                f'<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.06;0.92;1" dur="{dur}s" '
                f'begin="{begin}s" repeatCount="indefinite"/>'
            )
        opacity = ' opacity="0"' if fade else ""
        s = size
        self.add("packets", f'<g class="pk"{opacity}><path d="M0,{-s} L{s},0 L0,{s} L{-s},0z" class="r"/>{anim}</g>')

    def terminal(self, x, y, label) -> None:
        """START / END node: solid ink disc with a pulsing red ring."""
        self.add(
            "blocks",
            f'<g class="b"><circle cx="{x}" cy="{y}" r="29" class="sh" transform="translate(3 3)"/>'
            f'<circle class="pl" cx="{x}" cy="{y}" r="29"/><circle cx="{x}" cy="{y}" r="29" class="i"/></g>',
        )
        self.text(x, y + 5, label, cls="m o", weight=700, anchor="middle")

    def block(
        self,
        x,
        cy,
        *,
        hw=26,
        bh=16,
        code=None,
        title=None,
        sub=None,
        sub2=None,
        label="below",
        label_y=None,
        title_size=16,
        mono_title=False,
        number=None,
        key=False,
        cluster=False,
        glyphs=False,
        pulse=False,
        muted=False,
    ) -> Box:
        box = Box(x, cy, hw, bh)
        hh = box.hh
        sil = pts((x - hw, cy), (x, cy - hh), (x + hw, cy), (x + hw, cy + bh), (x, cy + hh + bh), (x - hw, cy + bh))
        g: list[str] = [f'<polygon points="{sil}" class="sh" transform="translate(4 4)"/>']
        if pulse:
            ring = pts((x, cy - hh - 7), (x + hw + 12, cy), (x, cy + hh + 7), (x - hw - 12, cy))
            g.append(f'<polygon class="pl" points="{ring}"/>')
        left = pts((x - hw, cy), (x, cy + hh), (x, cy + hh + bh), (x - hw, cy + bh))
        right = pts((x, cy + hh), (x + hw, cy), (x + hw, cy + bh), (x, cy + hh + bh))
        top = pts((x, cy - hh), (x + hw, cy), (x, cy + hh), (x - hw, cy))
        dash = ' stroke-dasharray="4 3"' if muted else ""
        g.append(f'<polygon points="{left}" class="L e"{dash}/>')
        g.append(f'<polygon points="{right}" class="R e"{dash}/><polygon points="{right}" fill="url(#hatch)"/>')
        g.append(f'<polygon points="{top}" class="{"r" if key else "t"} e"{dash}/>')
        face = "o" if key else "i"
        if number is not None:
            g.append(self._iso_text(x, cy, f"{number:02d}", 30 if hw > 40 else 20, f"m {face}", 0.62))
        if code:
            size = min(14.0, 2.0 * hw / max(len(code), 1))
            g.append(self._iso_text(x, cy, code, round(size, 1), f"m {face}", 0.8))
        if cluster:
            g.extend(self._cluster(box))
        if glyphs:
            g.append(self._iso_text(x - 15, cy - 9, "✓", 24, "u i", 0.9))
            g.append(self._iso_text(x + 15, cy + 9, "✕", 21, "u r", 0.95))
        self.add("blocks", f'<g class="b">{"".join(g)}</g>')

        style = {"size": max(14, title_size - 1.5), "cls": "m i"} if mono_title else {"size": title_size, "cls": "s i"}
        if title and label == "below":
            lines = title.split("\n")
            y = label_y if label_y is not None else box.bottom[1] + 26
            for ln in lines:
                self.text(x, y, ln, **style, weight=700, anchor="middle")
                y += 19
            for s in (sub, sub2):
                if s:
                    self.text(x, y, s, cls="u q", anchor="middle")
                    y += 18
        elif title and label in ("left", "right"):
            lx = x - hw - 18 if label == "left" else x + hw + 18
            anchor = "end" if label == "left" else "start"
            lines = title.split("\n")
            n = len(lines) + (sub is not None) + (sub2 is not None)
            y = (label_y if label_y is not None else cy + bh / 2 + 5) - (n - 1) * 9
            for ln in lines:
                self.text(lx, y, ln, **style, weight=700, anchor=anchor)
                y += 19
            for s in (sub, sub2):
                if s:
                    self.text(lx, y, s, cls="u q", anchor=anchor)
                    y += 18
        return box

    @staticmethod
    def _iso_text(cx, cy, text, size, cls, opacity) -> str:
        return (
            f'<g transform="matrix(.866 .5 -.866 .5 {cx:.1f} {cy:.1f})">'
            f'<text x="0" y="{size * 0.36:.1f}" text-anchor="middle" class="{cls}" font-size="{size}" '
            f'font-weight="700" fill-opacity="{opacity}">{escape(text)}</text></g>'
        )

    @staticmethod
    def _cluster(box: Box) -> list[str]:
        """Six mini cubes on a platform — one per Ario agent."""
        if box.hw >= 80:
            grid, mw, mhgt, lift = [(-48, -48), (-16, -48), (-48, -16), (16, -48), (-48, 16), (-16, -16)], 13, 10, 4
        else:
            grid, mw, mhgt, lift = [(u, v) for u in (-15, 0, 15) for v in (-8, 8)], 7, 6, 3
        cubes = sorted(((0.866 * (u - v), 0.5 * (u + v)) for u, v in grid), key=lambda t: t[1])
        out = []
        for dx, dy in cubes:
            mx, my = box.x + dx, box.cy + dy - lift
            mh = mw * ISO
            for face, cls in (
                (((mx - mw, my), (mx, my + mh), (mx, my + mh + mhgt), (mx - mw, my + mhgt)), "L"),
                (((mx, my + mh), (mx + mw, my), (mx + mw, my + mhgt), (mx, my + mh + mhgt)), "R"),
                (((mx, my - mh), (mx + mw, my), (mx, my + mh), (mx - mw, my)), "t"),
            ):
                out.append(f'<polygon points="{pts(*face)}" class="{cls} e" stroke-width="1"/>')
        return out

    # ---- output -------------------------------------------------------------
    def save(self) -> Path:
        body = "".join("".join(self.layers[k]) for k in self.LAYERS)
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" '
            f'height="{self.h}" role="img" aria-label="{escape(self.aria)}"><title>{escape(self.aria)}</title>'
            f"<style>{CSS}</style><defs>{''.join(self.defs)}</defs>{body}</svg>\n"
        )
        path = OUT_DIR / f"{self.name}.svg"
        path.write_text(svg, encoding="utf-8", newline="\n")
        return path


# =============================================================================
# Overview desk
# =============================================================================


def system_overview() -> Diagram:
    d = Diagram(
        "system-overview",
        900,
        title="System Overview",
        deck="Từ trình duyệt tới FastAPI, PostgreSQL, 5 nhà cung cấp LLM và 4 nguồn dữ liệu học thuật",
        desk="ARCHITECTURE DESK",
        fig="1.1",
        kicker="OVERVIEW",
        source="Cloud Run · asia-east1",
        ticker=("CLOUD RUN", "BEARER JWT", "SECURITY HEADERS", "X-REQUEST-ID", "TEX LIVE SANDBOX"),
        aria="System overview: browser, TanStack Start web service, FastAPI API service with TeX Live, PostgreSQL, "
        "five LLM providers and four scholarly APIs",
    )
    d.panel(M, 214, 170, 610, "BROWSER")
    d.panel(224, 214, 186, 610, "WEB")
    d.panel(424, 214, 232, 610, "API")
    d.panel(670, 214, 330, 118, "DATA")
    d.panel(670, 346, 330, 238, "LLM PROVIDERS")
    d.panel(670, 598, 330, 226, "SCHOLARLY APIS")
    big = {"hw": 40, "bh": 20, "title_size": 17}
    row = 330
    researcher = d.block(125, row, code="USR", title="Researcher", sub="trình duyệt", **big)
    store = d.block(125, 640, code="JWT", title="localStorage", sub="JWT + session", **big)
    web = d.block(317, 520, code="SSR", title="TanStack Start", sub="React 19 · Nitro SSR", sub2="Cloud Run web", **big)
    api = d.block(540, row, code="API", title="FastAPI", sub="/api/v1 · /ready", sub2="request-id · JSON logs", **big)
    tex = d.block(490, 640, code="TEX", title="TeX Live", sub="sandboxed")
    ing = d.block(600, 640, code="ING", title="Inngest", sub="optional", muted=True)
    pg = d.block(712, 282, code="PG", title="PostgreSQL", sub="Prisma schema + SQLAlchemy", label="right", key=True)
    llms = [
        d.block(725, 410, code="OAI", title="OpenAI"),
        d.block(835, 410, code="ANT", title="Anthropic"),
        d.block(945, 410, code="OR", title="OpenRouter"),
        d.block(780, 506, code="GLM", title="Z.AI GLM"),
        d.block(890, 506, code="GEM", title="Gemini"),
    ]
    sch = [
        d.block(755, 660, code="ARX", title="arXiv"),
        d.block(915, 660, code="DOI", title="CrossRef"),
        d.block(755, 756, code="S2", title="Semantic Scholar"),
        d.block(915, 756, code="OA", title="OpenAlex"),
    ]

    # The SSR server only renders pages; the browser bundle calls the API directly (VITE_API_URL).
    y1 = researcher.right[1]
    d.link(researcher, api, label="REST · SSE · WS")
    d.edge(f"M {researcher.right[0] + 8} {y1 + 12} H 238 V {web.left[1]} H {web.left[0] - 10}")
    d.text(246, 470, "HTML · JS", cls="m q")
    d.edge(
        f"M {researcher.x} {researcher.bottom[1] + 70} V {store.top[1] - 8}",
        label="lưu JWT",
        at=(researcher.x + 10, 520),
        anchor="start",
    )
    d.edge(f"M {tex.x} {api.bottom[1] + 108} V {tex.top[1] - 8}", label="compile", at=(tex.x - 10, 560), anchor="end")
    d.edge(f"M {ing.x} {api.bottom[1] + 108} V {ing.top[1] - 8}", dotted=True)
    trunk = 662
    d.edge(f"M {api.right[0] + 8} {y1} H {trunk}", arrow=False)
    d.edge(f"M {trunk} {pg.left[1]} V {sch[0].left[1]}", arrow=False)
    d.edge(f"M {trunk} {pg.left[1]} H {pg.left[0] - 10}")
    d.edge(f"M {trunk} {llms[0].left[1]} H {llms[0].left[0] - 10}")
    d.edge(f"M {trunk} {sch[0].left[1]} H {sch[0].left[0] - 10}")

    d.packet(f"M {researcher.x} {y1 + 12} H 238 V {web.left[1]} H {web.x}", 5)
    for i, target in enumerate((pg, llms[0], sch[0])):
        d.packet(f"M {researcher.x} {y1} H {trunk} V {target.left[1]} H {target.x}", 6, 1 + i * 2)
    return d


def architecture() -> Diagram:
    d = Diagram(
        "architecture",
        1030,
        title="System Architecture",
        deck="5 tầng xử lý — mọi đề xuất của AI đều phải qua Human Gate trước khi trở thành output",
        desk="ARCHITECTURE DESK",
        fig="1.2",
        kicker="OVERVIEW",
        source="src/ · frontend/",
        ticker=("LATEX-NATIVE", "HUMAN-IN-THE-LOOP", "MULTI-LLM FAILOVER", "QUOTA-METERED", "SANDBOXED TEX"),
        aria="Arionear system architecture: user, processing, human gate, output and infrastructure layers",
    )
    c = cols(7)
    bands = [(212, 368, "01", "USER"), (378, 516, "02", "PROCESSING"), (526, 644, "03", "GATE")]
    bands += [(654, 806, "04", "OUTPUT"), (816, 974, "05", "INFRA")]
    for i, (top, bottom, num, name) in enumerate(bands):
        d.glane(top, bottom, num, name, tint=i % 2 == 1)

    def node(i, cy, code, title, sub, **kw):
        return d.block(c[i], cy, code=code, title=title, sub=sub, **kw)

    u = 280
    upload = node(0, u, "ZIP", "LaTeX Upload", "ZIP · templates")
    imp = node(1, u, "DOC", "DOCX / PDF", "import → LaTeX")
    chat = node(2, u, "MSG", "Chat Intent", "Style · Edit · …")
    researcher = node(3, u, "USR", "Researcher", "tác giả bài báo")
    reviews = node(5, u, "R1", "Peer Reviews", "reviewer comments")
    defense = node(6, u, "QA", "Defense Mode", "mock viva")

    p = 428
    parser = node(0, p, "TEX", "LaTeX Parser", "sections · cites")
    store = node(1, p, "DB", "Paper Store", "Postgres + cache")
    router = node(2, p, "IR", "Intent Router", "rules → LLM")
    bottom = parser.bottom[1]
    agents = d.block(c[3], bottom - 36 * ISO - 18, hw=36, bh=18, cluster=True, title="Ario Agents", sub="6 agents · L1")
    integrity = node(4, p, "L2", "Integrity", "monitor · retry", key=True)
    peer = node(5, p, "PR", "Peer Review", "split → draft")
    council = node(6, p, "AI", "AI Council", "defense panel")

    diff = d.block(
        c[4],
        578,
        hw=44,
        bh=20,
        glyphs=True,
        pulse=True,
        label="left",
        title="Diff View · Accept / Reject",
        sub="tác giả duyệt từng thay đổi — AI không tự áp dụng",
        title_size=17,
    )

    o = 718
    outputs = [
        node(0, o, "PDF", "Revised Draft", "PDF + SyncTeX"),
        node(1, o, "%", "Paper Score", "export gate"),
        node(2, o, "REF", "Citations", "verify L1–L4"),
        node(3, o, "LOG", "Logic Audit", "comment-only"),
        node(4, o, "AI", "AI Disclosure", "EN/VI · LaTeX"),
        node(5, o, "TXT", "Reply Letter", "per-item drafts"),
    ]
    transcript = node(6, o, "Q&A", "Transcript", "defense Q&A")

    f = 866
    infra = [
        node(0, f, "API", "FastAPI", "REST · SSE · WS"),
        node(1, f, "LG", "LangGraph", "chat_stream"),
        node(2, f, "LLM", "LLM Providers", "5 · key failover"),
        node(3, f, "PG", "PostgreSQL", "Prisma schema"),
        node(4, f, "TEX", "TeX Live", "sandboxed"),
        node(5, f, "S2", "Citation APIs", "arXiv · CrossRef", sub2="S2 · OpenAlex"),
        node(6, f, "ADM", "Admin & Plans", "keys · quotas"),
    ]

    bus1 = 240
    d.edge(f"M {researcher.x:.1f} {researcher.top[1] - 4:.1f} V {bus1}", arrow=False)
    d.drops(bus1, [upload, imp, chat, reviews, defense])
    for a, b in [(upload, parser), (imp, store), (chat, router), (reviews, peer), (defense, council)]:
        d.edge(f"M {a.x:.1f} 363 V {b.top[1] - 8:.1f}", flow=False)
    chain_y = p + 8
    for a, b in [(parser, store), (store, router), (router, agents), (agents, integrity)]:
        d.link(a, b, y=chain_y)
    d.edge(f"M {integrity.x:.1f} 511 V {diff.top[1] - 8:.1f}")
    d.edge(f"M {peer.x:.1f} 511 V {diff.right[1]:.1f} H {diff.right[0] + 10:.1f}")
    d.edge(f"M {council.x:.1f} 511 V {transcript.top[1] - 8:.1f}")
    bus4 = 676
    d.edge(f"M {diff.x:.1f} {diff.bottom[1] + 4:.1f} V {bus4}", arrow=False)
    d.drops(bus4, outputs)
    iy = f + 8
    d.edge(f"M {infra[0].x:.1f} {iy} H {infra[-1].x:.1f}", arrow=False)

    d.packet(
        f"M {c[3]:.1f} 260 V {bus1} H {c[2]:.1f} V {chain_y} H {c[4]:.1f} V {diff.cy} V {bus4} H {c[0]:.1f} V {o}", 12
    )
    d.packet(f"M {c[3]:.1f} 260 V {bus1} H {c[5]:.1f} V {diff.right[1]:.1f} H {c[4]:.1f}", 7, 3)
    d.packet(f"M {c[3]:.1f} 260 V {bus1} H {c[6]:.1f} V {o}", 6, 1.5)
    d.packet(f"M {c[0]:.1f} {iy} H {c[6]:.1f}", 10, key_points="0;1;0", key_times="0;0.5;1", fade=False)
    return d


def request_flow() -> Diagram:
    d = Diagram(
        "request-flow",
        790,
        title="Request Flow",
        deck="Từ một câu chat đến bản thảo đã duyệt — mọi đề xuất của Ario đều qua guardrail và Human Gate",
        desk="ARCHITECTURE DESK",
        fig="1.3",
        kicker="PIPELINE",
        source="POST /api/v1/chat/stream",
        ticker=("SSE STREAMING", "LLM QUOTA METERED", "GUARDRAIL L1–L2", "HUMAN GATE", "SANDBOXED TEX"),
        aria="Arionear request flow: Editor, FastAPI, Intent Router, Ario Agents, LLM Providers, Integrity Monitor, "
        "Human Gate, PDF compile",
    )
    cx, row1, row2 = (120, 360, 600, 860), 330, 604
    big = {"hw": 56, "bh": 28, "title_size": 18}
    b1 = d.block(cx[0], row1, code="UI", title="Editor", sub="React 19 · LaTeX", **big)
    b2 = d.block(cx[1], row1, code="API", title="FastAPI", sub="Bearer JWT · quota", **big)
    b3 = d.block(cx[2], row1, code="IR", title="Intent Router", sub="rules → LLM classifier", **big)
    b4 = d.block(cx[3], row1 + 32.3 - 57.7, hw=100, bh=28, cluster=True, title="Ario Agents", title_size=18)
    b5 = d.block(cx[3], row2, code="LLM", title="LLM Providers", sub="GLM · Gemini · GPT · Claude", **big)
    b6 = d.block(cx[2], row2, code="L2", title="Integrity Monitor", sub="numeric drift · scope", key=True, **big)
    b7 = d.block(cx[1], row2, glyphs=True, pulse=True, title="Human Gate", sub="Accept ✓ / Reject ✕", **big)
    b8 = d.block(cx[0], row2, code="PDF", title="PDF + SyncTeX", sub="TeX Live sandbox", **big)
    for i, b in enumerate((b1, b2, b3, b4, b5, b6, b7, b8), start=1):
        d.text(b.x, b.top[1] - 13, f"{i:02d}", cls="m r", weight=700, anchor="middle")

    py0 = b4.bottom[1] + 52
    for i, name in enumerate(["Style", "Edit", "Structure", "Citation", "Template", "Logic"]):
        col, row = i % 3, i // 3
        px, py = b4.x + (col - 1) * 92 - 43, py0 + row * 32
        d.add("labels", f'<rect x="{px:.1f}" y="{py:.1f}" width="86" height="25" class="t e"/>')
        d.text(px + 43, py + 17.5, name, anchor="middle")

    for a, b, label in [(b1, b2, "/chat/stream"), (b2, b3, "classify"), (b3, b4, "dispatch")]:
        d.link(a, b, y=a.right[1], label=label)
    for a, b, label in [(b5, b6, "edits[]"), (b6, b7, "diff · flags"), (b7, b8, "accept")]:
        d.link(a, b, label=label)
    ytop = py0 + 64
    d.edge(
        f"M {b4.x} {ytop:.1f} V {b5.top[1] - 30:.1f}",
        label="prompt + L1",
        at=(b4.x + 12, (ytop + b5.top[1]) / 2 - 8),
        anchor="start",
    )
    d.packet(f"M {cx[0]} {b1.right[1]} H {b4.x} V {b5.cy} H {cx[0]}", 9, fade=False)
    return d


def _sequence(
    name: str,
    *,
    parts: list[tuple[str, str]],
    msgs: list[tuple[int, int, str, bool]],
    frames: tuple[dict, ...] = (),
    x_span: tuple[float, float] = (130, 960),
    **header,
) -> Diagram:
    """Animated sequence diagram: messages light up in order, each with a travelling packet.

    ``parts`` items are ``(title, code)`` (``\\n`` in a title breaks the line); ``msgs`` items are
    ``(from, to, label, is_return)``; ``from == to`` draws a self-call. ``frames`` items are
    ``{"cols": (a, b), "branches": [(msg_index, label), ...], "end": msg_index}``.
    """
    row_h, first = 36, 354
    starts = sorted(idx for fr in frames for idx, _ in fr["branches"])

    def row_y(i: int) -> float:
        return first + i * row_h + 18 * sum(1 for s in starts if s <= i)

    last = row_y(len(msgs) - 1)
    d = Diagram(name, int(last + 30 + 40 + 24), **header)
    x0, x1 = x_span
    xs = [x0 + i * (x1 - x0) / (len(parts) - 1) for i in range(len(parts))]
    life_end = last + 22
    for x, (pname, code) in zip(xs, parts, strict=True):
        d.add(
            "lanes",
            f'<path d="M {x:.1f} 322 V {life_end:.1f}" class="ln" stroke-opacity=".3" stroke-dasharray="3 5"/>',
        )
        d.block(x, 242, code=code, title=pname, label_y=296)

    for frame in frames:
        a, b = frame["cols"]
        branches = frame["branches"]
        end = frame.get("end", branches[-1][0])
        fx0, fx1 = xs[a] - 48, xs[b] + 48
        fy0, fy1 = row_y(branches[0][0]) - row_h - 6, row_y(end) + 12
        d.add(
            "lanes",
            f'<rect x="{fx0:.1f}" y="{fy0:.1f}" width="{fx1 - fx0:.1f}" height="{fy1 - fy0:.1f}" class="ln" '
            f'stroke-opacity=".55" stroke-dasharray="5 4"/>',
        )
        for k, (idx, label) in enumerate(branches):
            sy = row_y(idx) - row_h - 6
            if k:
                d.add(
                    "lanes",
                    f'<path d="M {fx0:.1f} {sy:.1f} H {fx1:.1f}" class="ln" stroke-opacity=".4" stroke-dasharray="3 4"/>',
                )
            tw = d.tag(fx0, sy, "ALT" if k == 0 else "ELSE", red=False, layer="lanes", h=22)
            d.text(fx0 + tw + 8, sy + 16, f"[{label}]", cls="m r", weight=700, layer="lanes")

    step, move, hold = 0.85, 0.7, 2.5
    total = len(msgs) * step + hold
    for i, (a, b, label, ret) in enumerate(msgs):
        y = row_y(i)
        dash = ' stroke-dasharray="5 5"' if ret else ""
        if a == b:
            x = xs[a]
            path = f"M {x + 5:.1f} {y - 10:.1f} h 34 v 14 h -27"
            label_xy, anchor = (x + 48, y), "start"
        else:
            x1_, x2_ = xs[a], xs[b]
            direction = 1 if x2_ > x1_ else -1
            path = f"M {x1_ + 5 * direction:.1f} {y} H {x2_ - 9 * direction:.1f}"
            label_xy, anchor = ((x1_ + x2_) / 2, y - 8), "middle"
        d.add("edges", f'<path d="{path}" class="tk"{dash} marker-end="url(#ah)"/>')
        s, e = (i * step + 0.4) / total, (i * step + 0.4 + move) / total
        reveal = f'values="0;0;1;1;0" keyTimes="0;{s:.4f};{e:.4f};0.985;1" dur="{total:.2f}s" repeatCount="indefinite"'
        d.add(
            "edges",
            f'<path d="{path}" class="ln pk" style="stroke:var(--rd)" stroke-width="2"{dash} '
            f'opacity="0"><animate attributeName="opacity" {reveal}/></path>',
        )
        d.text(*label_xy, label, anchor=anchor, halo=True)
        d.text(M, y + 5, f"{i + 1:02d}", cls="m q", weight=700, layer="lanes")
        d.add(
            "lanes",
            f'<text x="{M}" y="{y + 5}" class="m r pk" font-size="14" font-weight="700" opacity="0">'
            f'{i + 1:02d}<animate attributeName="opacity" {reveal}/></text>',
        )
        d.add(
            "packets",
            f'<g class="pk" opacity="0"><path d="M0,-5 L5,0 L0,5 L-5,0z" class="r"/>'
            f'<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;{s:.4f};{s + 0.004:.4f};{e:.4f};'
            f'{e + 0.004:.4f};1" dur="{total:.2f}s" repeatCount="indefinite"/>'
            f'<animateMotion path="{path}" keyPoints="0;0;1;1" keyTimes="0;{s:.4f};{e:.4f};1" calcMode="linear" '
            f'dur="{total:.2f}s" repeatCount="indefinite"/></g>',
        )
    return d


def sequence() -> Diagram:
    parts = [
        ("Researcher", "USR"),
        ("Editor", "UI"),
        ("FastAPI", "API"),
        ("Intent\nRouter", "IR"),
        ("Ario\nAgent", "AG"),
        ("Integrity", "L2"),
        ("LLM", "LLM"),
        ("PostgreSQL", "PG"),
    ]
    msgs = [
        (0, 1, "Mở project", False),
        (1, 7, "GET /papers/{id}  (Bearer JWT)", False),
        (1, 2, "syncSession() — best-effort", False),
        (0, 1, "Chat: “rút gọn intro”, “sườn IMRaD”…", False),
        (1, 2, "POST /chat/stream  (SSE, Bearer)", False),
        (2, 2, "LLM quota + rate limit · request guard", False),
        (2, 3, "classify_intent (rules → LLM)", False),
        (3, 1, "event: state · activity", True),
        (3, 4, "dispatch task", False),
        (4, 6, "prompt + guardrail L1", False),
        (6, 4, "suggestion / edits[]", True),
        (4, 5, "L2 validate — numeric drift, scope", False),
        (5, 4, "blocking flag → retry / safe fallback", True),
        (5, 2, "suggestion · diff · edits · flags", True),
        (2, 1, "event: token … event: done", True),
        (1, 0, "Diff đỏ/xanh + Accept / Reject", True),
        (0, 1, "Accept", False),
        (1, 2, "POST /revisions/{session}/{id}  accepted", False),
        (1, 7, "PATCH /papers/{id}  (coalesced save)", False),
        (1, 2, "POST /compile  (gzip, ≤ 64 MB)", False),
        (2, 1, "PDF base64 + SyncTeX", True),
    ]
    return _sequence(
        "sequence",
        parts=parts,
        msgs=msgs,
        frames=({"cols": (2, 5), "branches": [(12, "blocked"), (13, "ok")]},),
        title="End-to-end Sequence",
        deck="Một vòng chỉnh sửa: chat → agent → guardrail → diff → Accept → lưu & compile",
        desk="ARCHITECTURE DESK",
        fig="1.4",
        kicker="SEQUENCE",
        source="editor ⇄ /api/v1",
        ticker=("SSE", "JWT BEARER", "QUOTA GATE", "HUMAN GATE", "COALESCED SAVES"),
        aria="End-to-end sequence between researcher, editor, FastAPI, intent router, agent, integrity monitor, "
        "LLM and PostgreSQL",
    )


# =============================================================================
# Backend desk
# =============================================================================


def api_surface() -> Diagram:
    d = Diagram(
        "api-surface",
        1070,
        title="Backend API Surface",
        deck="Mọi route nằm dưới /api/v1 — router mỏng, logic nằm trong services/",
        desk="BACKEND DESK",
        fig="2.1",
        kicker="API",
        source="src/api/*.py → src/services/",
        ticker=("FASTAPI", "OPENAPI /docs", "RED TOP = LLM QUOTA", "SECURITY HEADERS", "HSTS IN PROD"),
        aria="Backend API surface: route groups under /api/v1, the services behind them, and shared data stores",
    )
    d.glane(212, 316, "01", "CLIENT")
    d.glane(326, 826, "02", "API /api/v1", tint=True)
    d.glane(836, 1014, "03", "SHARED")
    c = cols(5)
    fe = d.block(c[0], 262, code="UI", title="Frontend", sub="Authorization: Bearer <JWT>", label="right")
    d.text(c[2] - 20, 248, "middleware  RequestContext · CORS · SecurityHeaders", cls="m i", weight=700)
    d.text(c[2] - 20, 268, "X-Request-ID · nosniff · DENY · CSP · HSTS (prod)", cls="m q")
    d.text(c[2] - 20, 288, "probes      GET /health · GET /ready (ngoài /api/v1)", cls="u q")

    rows = [
        [
            ("SSE", "/chat/stream", "SSE · intent · L2", "chat_stream.py", True),
            ("LG", "/chat", "+ /edit/style (sync)", "agents/graph.py", True),
            ("TEX", "/compile", "sandbox · 64 MB cap", "latex_compile.py", False),
            ("REF", "/citations/*", "verify · relevance L4", "citations/", True),
            ("R1", "/review/respond", "peer-review drafts", "peer_review/", True),
        ],
        [
            ("DOC", "/import/document", "DOCX/PDF ≤ 15 MB", "document_import/", False),
            ("PG", "/papers/*", "CRUD · share links", "paper_service.py", False),
            ("AI", "…/ai-disclosure", "AI contribution report", "ai_disclosure.py", False),
            ("WS", "/ws/share/{token}", "live sync · owner-only", "share_room.py", False),
            ("TPL", "/templates/*", "gallery · admin CRUD", "template_store.py", False),
        ],
        [
            ("JWT", "/auth/*", "JWT · Google · /users/me", "auth_service.py", False),
            ("SES", "/sessions/*", "revisions · citations", "sessions.py", False),
            ("QA", "/defense/*", "turn quota · SSE", "defense_stream.py", True),
            ("$", "/billing/*", "demo checkout off in prod", "billing_service.py", False),
            ("ADM", "/admin/*", "god admin · LLM keys", "admin_service.py", False),
        ],
    ]
    spine = GUTTER + 6
    d.edge(f"M {fe.x:.1f} {fe.bottom[1] + 4:.1f} V 300 H {spine} V 866", arrow=False)
    row_cy = (400, 562, 724)
    for cy, row in zip(row_cy, rows, strict=True):
        boxes = []
        for x, (code, path, sub, svc, llm) in zip(c, row, strict=True):
            b = d.block(x, cy, code=code, title=path, sub=sub, mono_title=True, key=llm)
            d.text(x, b.bottom[1] + 26 + 19 + 18, svc, cls="m q", anchor="middle")
            boxes.append(b)
        d.drops(cy - 40, boxes, x_from=spine)

    shared = [
        d.block(c[0], 905, code="Q", title="quota_policy.py", sub="mọi đường LLM", mono_title=True, key=True),
        d.block(c[1], 905, code="PG", title="PostgreSQL", sub="papers · suggestions"),
        d.block(c[2], 905, code="LLM", title="LLM Providers", sub="llm_failover.py"),
        d.block(c[3], 905, code="TEX", title="TeX Live", sub="env allowlist · no shell"),
        d.block(c[4], 905, code="S2", title="Citation APIs", sub="arXiv · CrossRef · S2", sub2="OpenAlex"),
    ]
    d.drops(866, shared, x_from=spine)
    d.packet(f"M {fe.x} {fe.bottom[1]} V 300 H {spine} V 360 H {c[0]} V 400", 5)
    d.packet(f"M {fe.x} {fe.bottom[1]} V 300 H {spine} V 684 H {c[2]} V 724", 6, 1.5)
    d.packet(f"M {fe.x} {fe.bottom[1]} V 300 H {spine} V 866 H {c[1]} V 905", 7, 3)
    return d


def langgraph() -> Diagram:
    d = Diagram(
        "langgraph",
        800,
        title="LangGraph Orchestrator",
        deck="Sync path POST /chat — parse_node rẽ theo task; chỉnh sửa văn bản (style · edit) đi qua integrity_node",
        desk="BACKEND DESK",
        fig="2.2",
        kicker="AGENT GRAPH",
        source="src/agents/graph.py",
        ticker=("STATEGRAPH", "QUOTA BEFORE INVOKE", "L2 ON STYLE + EDIT", "ERROR SHORT-CIRCUIT"),
    )
    rows = [250, 330, 410, 490, 570, 650]
    mid = 450
    sx, rx, px, trunk, bx, ix, jx, rspx, ex = 70, 168, 282, 372, 560, 735, 812, 880, 970
    d.text(sx, mid - 50, "POST /chat", cls="m q", anchor="middle")
    d.text(sx, mid + 56, "quota gate", cls="u q", anchor="middle")
    d.terminal(sx, mid, "START")
    d.terminal(ex, mid, "END")
    small = {"mono_title": True, "title_size": 16}
    route = d.block(rx, mid - 7.5, code="IR", title="route_node", sub="intent", **small)
    parse = d.block(px, mid - 7.5, code="TEX", title="parse_node", sub="sections", **small)
    branches = [
        ("style_node", "style", "STY"),
        ("edit_node", "edit", "EDT"),
        ("structure_node", "structure", "STR"),
        ("logic_node", "logic", "LOG"),
        ("citation_node", "citation", "REF"),
        ("chat_node", "chat · template", "MSG"),
    ]
    bnodes = [d.block(bx, y, code=code, title=t, **small) for (t, _l, code), y in zip(branches, rows, strict=True)]
    integrity = d.block(
        ix, (rows[0] + rows[1]) / 2, code="L2", title="integrity_node", sub="guardrail L2", key=True, **small
    )
    respond = d.block(rspx, mid - 7.5, code="OUT", title="respond_node", sub="format reply", **small)

    d.edge(f"M {sx + 30} {mid} H {route.left[0] - 10}")
    d.link(route, parse, y=mid)
    d.edge(f"M {parse.right[0] + 8} {mid} H {trunk}", arrow=False)
    d.edge(f"M {trunk} {bnodes[0].left[1]} V {bnodes[-1].left[1]}", arrow=False)
    for node, (_t, lbl, _c) in zip(bnodes, branches, strict=True):
        y = node.left[1]
        d.edge(f"M {trunk} {y} H {node.left[0] - 10}", label=lbl, at=(trunk + 12, y - 9), anchor="start")
    for node in bnodes[:2]:
        d.edge(f"M {node.right[0] + 8} {node.right[1]} H 650 V {integrity.left[1]} H {integrity.left[0] - 10}")
    d.edge(f"M {integrity.right[0] + 8} {integrity.right[1]} H {jx} V {mid - 6} H {respond.left[0] - 10}")
    for node in bnodes[2:]:
        d.edge(f"M {node.right[0] + 8} {node.right[1]} H {jx} V {mid + 6} H {respond.left[0] - 10}")
    d.edge(f"M {respond.right[0] + 8} {mid} H {ex - 31}")
    d.edge(
        f"M {px} {parse.bottom[1] + 64} V 735 H {rspx} V {respond.bottom[1] + 64}",
        dotted=True,
        label="state.error → respond",
        at=((px + rspx) / 2, 729),
    )

    head = f"M {sx} {mid} H {trunk}"
    for i, node in enumerate(bnodes):
        y = node.left[1]
        if i < 2:
            tail = f"V {y} H 650 V {integrity.left[1]} H {jx} V {mid} H {ex}"
        else:
            tail = f"V {y} H {jx} V {mid} H {ex}"
        d.packet(f"{head} {tail}", 7.5, i * 1.25)
    return d


def sse_chat() -> Diagram:
    parts = [
        ("Editor", "UI"),
        ("chat_stream.py", "SSE"),
        ("logic_audit", "LA"),
        ("LLM", "LLM"),
        ("integrity.py", "L2"),
    ]
    msgs = [
        (0, 1, "POST /chat/stream {task, latex}", False),
        (1, 1, "quota + rate limit · request guard", False),
        (1, 1, "intent / task detect", False),
        (1, 2, "multi-agent debate + synthesize", False),
        (1, 0, "event: logic_section … done {report}", True),
        (1, 3, "rewrite (+ reasoning stream)", False),
        (1, 4, "L2 integrity + retry", False),
        (1, 0, "done {suggestion, diff, flags}", True),
        (1, 0, "done {apply_mode: document}", True),
        (1, 3, "task handler", False),
        (1, 0, "token … done", True),
        (0, 0, "Diff Accept / Reject hoặc panel chỉ đọc", False),
    ]
    return _sequence(
        "sse-chat",
        parts=parts,
        msgs=msgs,
        frames=(
            {
                "cols": (0, 4),
                "branches": [(3, "logic"), (5, "style · edit"), (8, "template"), (9, "citation · structure · chat")],
                "end": 10,
            },
        ),
        x_span=(150, 900),
        title="SSE — Editor Chat",
        deck="POST /chat/stream rẽ nhánh theo task — chỉ chỉnh sửa văn bản (style · edit) mới qua integrity L2",
        desk="BACKEND DESK",
        fig="2.3",
        kicker="STREAM",
        source="chat_stream.py · sse.py",
        ticker=("TEXT/EVENT-STREAM", "STATE · ACTIVITY · TOKEN · DONE", "QUOTA → EVENT: ERROR", "L2 RETRY"),
        aria="SSE editor chat: the stream service checks quota, then branches by task into logic audit, style and "
        "edit with integrity check, template, or other handlers",
    )


def citation_verifier() -> Diagram:
    d = Diagram(
        "citation-verifier",
        910,
        title="Citation Verifier",
        deck="Mỗi cite key qua tối đa 4 nguồn — không khớp thì trả not_found, không bao giờ bịa",
        desk="BACKEND DESK",
        fig="2.4",
        kicker="CITATIONS",
        source="src/services/citations/",
        ticker=("ARXIV → CROSSREF → S2 → OPENALEX", "NO FABRICATION", "L4 COMMENT-ONLY", "≤ 15 KEYS / CALL"),
        aria="Citation verifier: arXiv, CrossRef, Semantic Scholar then OpenAlex fallback, not_found otherwise; "
        "layer 4 LLM relevance check",
    )
    xs = (110, 270, 450, 630, 810, 950)
    r1, r2, bus = 270, 440, 548
    src = d.block(xs[0], r1, code="BIB", title="BibTeX", sub="bibtexparser v2")
    d1 = d.block(xs[1], r1, code="?", title="arXiv id?")
    d2 = d.block(xs[2], r1, code="?", title="DOI?")
    d3 = d.block(xs[3], r1, code="?", title="Title?")
    d4 = d.block(xs[4], r1, code="?", title="Any id?")
    nf = d.block(xs[5], r1, code="∅", title="not_found", sub="ghi nhận thật", mono_title=True, key=True)
    apis = [
        d.block(xs[1], r2, code="ARX", title="arXiv API"),
        d.block(xs[2], r2, code="DOI", title="CrossRef"),
        d.block(xs[3], r2, code="S2", title="Sem. Scholar"),
        d.block(xs[4], r2, code="OA", title="OpenAlex", sub="fallback"),
    ]
    out = d.block(xs[5], bus - 8, code="OK", title="verified", sub="| possible_mismatch", mono_title=True)

    d.link(src, d1)
    for a, b in [(d1, d2), (d2, d3), (d3, d4), (d4, nf)]:
        d.link(a, b, label="không")
    for a, b in zip((d1, d2, d3, d4), apis, strict=True):
        d.edge(f"M {a.x} {a.bottom[1] + 36} V {b.top[1] - 8}", label="có", at=(a.x + 10, 382), anchor="start")
    # a lookup that finds nothing falls through to the next layer
    ry = d1.right[1]
    for i, api in enumerate(apis[:3]):
        mx = (xs[i + 1] + xs[i + 2]) / 2
        d.edge(f"M {api.right[0] + 8} {api.right[1]} H {mx} V {ry + 3}", dotted=True, arrow=False)
    d.edge(f"M {apis[3].right[0] + 8} {apis[3].right[1]} H 880 V {ry + 4} H {nf.left[0] - 10}", dotted=True)
    d.text(xs[1] + 44, r2 + 28, "không thấy", cls="u q", anchor="start", halo=True)
    for a in apis:
        d.edge(f"M {a.x} {r2 + 84} V {bus}", arrow=False)
    d.edge(f"M {xs[1]} {bus} H {out.left[0] - 10}")
    d.text((xs[1] + xs[3]) / 2, bus - 10, "tìm thấy → so tiêu đề (rapidfuzz)", anchor="middle", cls="u q", halo=True)

    d.text(
        M,
        226,
        "Batch: 6 key song song trên một HTTP client · cache 6h cho kết quả tìm thấy · quá 120s → unverified",
        cls="u q",
    )
    d.lane(662, 852, "L4", "RELEVANCE", "POST /citations/relevance · comment-only")
    l4 = cols(4, M, W - M)
    blocks = [
        d.block(l4[0], 745, code="CLM", title="Claim context", sub="câu chứa \\cite{key}"),
        d.block(l4[1], 745, code="ABS", title="Source abstract", sub="OpenAlex · S2"),
        d.block(l4[2], 745, code="LLM", title="LLM judge", sub="quota-metered", sub2="json-repair → JSON", key=True),
        d.block(l4[3], 745, code="V", title="Verdict", sub="supports · partial", sub2="unrelated · insufficient"),
    ]
    for a, b in zip(blocks, blocks[1:], strict=False):
        d.link(a, b)

    y0 = src.right[1]
    for i, dec in enumerate((d1, d2, d3)):
        d.packet(f"M {src.x} {y0} H {dec.x} V {bus} H {out.x}", 7, i * 1.75)
    d.packet(f"M {src.x} {y0} H {nf.x}", 7, 5.25)
    d.packet(f"M {l4[0]} {blocks[0].right[1]} H {l4[3]}", 6, 0.5)
    return d


def persistence() -> Diagram:
    d = Diagram(
        "persistence",
        650,
        title="Paper & Session Persistence",
        deck="Ba lớp lưu trữ có chủ đích — UI phản hồi tức thì, PostgreSQL là nguồn sự thật",
        desk="BACKEND DESK",
        fig="2.5",
        kicker="STORAGE",
        source="project-store.ts · sessions.py · paper_repository.py",
        ticker=("COALESCED SAVES", "BEST-EFFORT SYNC", "POSTGRESQL = SOURCE OF TRUTH"),
    )
    big = {"hw": 56, "bh": 28, "title_size": 18}
    fe = d.block(170, 290, code="LS", title="Frontend cache", sub="localStorage · project-store", **big)
    db = d.block(
        830,
        290,
        code="PG",
        title="PostgreSQL",
        sub="papers · users · suggestions",
        sub2="ai_sessions · usage",
        key=True,
        **big,
    )
    ss = d.block(
        500, 470, code="MEM", title="Session store", sub="revisions · citations", sub2="in-memory khi chưa có DB", **big
    )
    (x1, y1), (x2, _y2) = fe.right, db.left
    d.edge(f"M {x1 + 8} {y1} H {x2 - 10}", label="PATCH /papers — coalesced", at=((x1 + x2) / 2, y1 - 11))
    d.edge(
        f"M {fe.x} {fe.bottom[1] + 72} V {ss.left[1]} H {ss.left[0] - 10}",
        label="best-effort sync",
        at=(fe.x + 12, ss.left[1] - 11),
        anchor="start",
    )
    d.edge(
        f"M {ss.right[0] + 8} {ss.right[1]} H 978 V {db.right[1]} H {db.right[0] + 10}",
        dotted=True,
        label="DatabaseSessionStore khi DB sẵn sàng",
        at=((ss.right[0] + 978) / 2, ss.right[1] - 11),
    )
    d.packet(f"M {fe.x} {y1} H {db.x}", 4.5)
    d.packet(f"M {fe.x} {fe.bottom[1] + 60} V {ss.left[1]} H {ss.x}", 4.5, 1.6)
    return d


# =============================================================================
# Frontend desk
# =============================================================================


def frontend_routes() -> Diagram:
    d = Diagram(
        "frontend-routes",
        818,
        title="Frontend Routes & Components",
        deck="File-based routing (TanStack Start) — editor shell ghép từ các panel độc lập",
        desk="FRONTEND DESK",
        fig="3.1",
        kicker="ROUTES",
        source="frontend/src/routes/",
        ticker=("TANSTACK ROUTER", "REACT 19", "REQUIREAUTH()", "PDF LINKS: HTTP(S) · MAILTO"),
    )
    c = cols(6)
    d.glane(212, 380, "01", "PUBLIC")
    d.glane(390, 560, "02", "WORKSPACE", tint=True)
    d.glane(570, 758, "03", "SHELL")
    mt = {"mono_title": True}

    def node(i, cy, code, title, sub, **kw):
        return d.block(c[i], cy, code=code, title=title, sub=sub, **mt, **kw)

    signin = node(0, 262, "IN", "/signin", "/signup · Google SSO")
    tpl = node(1, 262, "TPL", "/templates", "gallery · public")
    node(2, 262, "/", "/", "landing · /pricing …")
    node(3, 262, "LNK", "/share/$token", "read-only snapshot")
    node(4, 262, "?", "/latex-guide", "LaTeX primer")
    node(5, 262, "MKT", "/features", "/about · /workflow …")

    prj = node(0, 452, "PRJ", "/projects", "+ DOCX/PDF import")
    ed = node(1, 452, "ED", "/editor", "?projectId=")
    node(2, 452, "ME", "/profile", "/plan · /guide")
    node(3, 452, "ADM", "/admin", "god admin only")
    dfs = node(5, 452, "DEF", "/defense", "?projectId=")

    shell = [
        node(0, 632, "TEX", "LatexEditor", "+ inline diff"),
        node(1, 632, "PDF", "PdfPreviewPanel", "PDF.js · SyncTeX"),
        node(2, 632, "AI", "ChatOverlay", "Ario · SSE"),
        node(3, 632, "KIT", "ToolsPanel", "versions · logic …"),
        node(4, 632, "%", "PaperScore\nDownloadDialog", "score + AI disclosure"),
    ]
    dchat = node(5, 632, "QA", "DefenseChatPanel", "+ PdfPreviewPanel")

    d.edge(f"M {signin.x:.1f} 355 V {prj.top[1] - 8:.1f}", label="JWT", at=(signin.x + 10, 374), anchor="start")
    d.edge(f"M {tpl.x:.1f} 355 V {ed.top[1] - 8:.1f}", label="open", at=(tpl.x + 10, 374), anchor="start")
    d.link(prj, ed)
    jx = (c[1] + c[2]) / 2
    d.edge(f"M {ed.right[0] + 8:.1f} {ed.right[1]:.1f} H {jx:.1f} V 408 H {dfs.x:.1f} V {dfs.top[1] - 8:.1f}")
    d.text((c[3] + c[5]) / 2, 426, "defense", cls="m q", anchor="middle")
    bus = 590
    d.edge(f"M {ed.x:.1f} 533 V {bus}", arrow=False)
    d.drops(bus, shell)
    d.edge(f"M {dfs.x:.1f} 533 V {dchat.top[1] - 8:.1f}")
    d.packet(f"M {c[0]:.1f} 300 V {prj.cy} H {ed.x:.1f} V {bus} H {c[4]:.1f} V {shell[4].cy}", 8)
    d.packet(f"M {ed.x:.1f} {ed.right[1]:.1f} H {jx:.1f} V 408 H {dfs.x:.1f} V {dchat.cy}", 6, 2)
    return d


def auth_session() -> Diagram:
    d = Diagram(
        "auth-session",
        720,
        title="Auth & Session",
        deck="JWT do FastAPI ký (HS256), lưu ở localStorage và gửi kèm Bearer cho mọi request cần đăng nhập",
        desk="FRONTEND DESK",
        fig="3.2",
        kicker="AUTH",
        source="auth_service.py · auth-store.ts",
        ticker=("JWT 72H · REMEMBER 30D", "GOOGLE SSO", "SECRET ≥ 32 CHARS IN PROD", "WS: bearer.<jwt>"),
    )
    xs = (120, 320, 520, 720, 920)
    big = {"hw": 38, "bh": 20, "title_size": 17}
    nodes = [
        d.block(xs[0], 330, code="IN", title="Sign in", sub="email code · Google", **big),
        d.block(xs[1], 330, code="API", title="/auth/*", sub="verify · PyJWT", mono_title=True, **big),
        d.block(xs[2], 330, code="JWT", title="Access token", sub="72h · remember 30d", key=True, **big),
        d.block(xs[3], 330, code="LS", title="localStorage", sub="chia sẻ giữa các tab", **big),
        d.block(xs[4], 330, code="API", title="/api/v1/*", sub="Authorization: Bearer", mono_title=True, **big),
    ]
    for a, b, lbl in zip(nodes, nodes[1:], ["credentials", "sign", "persist", "Bearer"], strict=False):
        d.link(a, b, label=lbl)
    d.edge(
        f"M {nodes[4].x} {nodes[4].top[1] - 22} V 228 H {nodes[3].x} V {nodes[3].top[1] - 22}",
        dotted=True,
        label="401 → xoá session, đăng nhập lại",
        at=((nodes[3].x + nodes[4].x) / 2, 221),
    )
    sec = d.block(
        xs[1], 540, code="KEY", title="AUTH_SECRET_KEY", sub="prod: ≥ 32 ký tự, khác mặc định", mono_title=True
    )
    ws = d.block(xs[3], 540, code="WS", title="/ws/share/{token}", sub="subprotocol bearer.<jwt>", mono_title=True)
    adm = d.block(xs[4], 540, code="ADM", title="get_admin_user", sub="god admin → 403 khác", mono_title=True)
    d.text(ws.x, ws.bottom[1] + 26 + 19 + 18, "owner-only · 4401 / 4403", cls="u q", anchor="middle")
    d.text(adm.x, adm.bottom[1] + 26 + 19 + 18, "/admin · /billing/upgrade", cls="u q", anchor="middle")
    d.edge(
        f"M {sec.x} {sec.top[1] - 8} V {nodes[1].bottom[1] + 66}",
        dotted=True,
        label="HS256",
        at=(sec.x + 10, 465),
        anchor="start",
    )
    d.edge(
        f"M {nodes[3].x} {nodes[3].bottom[1] + 66} V {ws.top[1] - 8}",
        label="live sync",
        at=(ws.x + 10, 465),
        anchor="start",
    )
    d.edge(
        f"M {nodes[4].x} {nodes[4].bottom[1] + 66} V {adm.top[1] - 8}",
        label="admin",
        at=(adm.x + 10, 465),
        anchor="start",
    )
    d.packet(f"M {nodes[0].x} {nodes[0].right[1]} H {nodes[4].x}", 6)
    return d


def template_gallery() -> Diagram:
    d = Diagram(
        "template-gallery",
        660,
        title="Template Gallery",
        deck="Chọn template (IEEE, Springer LNCS, Elsevier) → tạo paper mới trong PostgreSQL → mở thẳng vào editor",
        desk="FRONTEND DESK",
        fig="3.3",
        kicker="TEMPLATES",
        source="template_store.py · template_builtins.py",
        ticker=("GET /templates", "POST /templates/{id}/open", "IEEE · LNCS · ELSEVIER", "ADMIN CRUD"),
    )
    xs = (120, 365, 615, 880)
    big = {"hw": 38, "bh": 20, "title_size": 17}
    gal = d.block(xs[0], 300, code="TPL", title="/templates", sub="gallery · public", mono_title=True, **big)
    lst = d.block(xs[1], 300, code="GET", title="GET /templates", sub="list · preview · PDF", mono_title=True, **big)
    store = d.block(xs[2], 300, code="REG", title="template_store", sub="data/templates/", mono_title=True, **big)
    d.text(store.x, store.bottom[1] + 26 + 19 + 18, "registry.json", cls="m q", anchor="middle")
    seed = d.block(xs[3], 300, code="SD", title="Built-ins", sub="IEEE · LNCS · Elsevier", key=True, **big)
    d.text(seed.x, seed.bottom[1] + 26 + 19 + 18, "+ admin CRUD", cls="u q", anchor="middle")
    opn = d.block(xs[1], 500, code="NEW", title="Open as Template", sub="POST …/{id}/open", **big)
    paper = d.block(xs[2], 500, code="PG", title="Paper mới", sub="PostgreSQL", **big)
    ed = d.block(xs[3], 500, code="ED", title="/editor", sub="?projectId=", mono_title=True, **big)
    d.link(gal, lst)
    d.link(lst, store, label="read")
    d.link(seed, store, label="seed")
    d.edge(
        f"M {gal.x} {gal.bottom[1] + 70} V {opn.left[1]} H {opn.left[0] - 10}",
        label="Bearer",
        at=(gal.x + 12, opn.left[1] - 11),
        anchor="start",
    )
    d.link(opn, paper, label="create")
    d.link(paper, ed, label="open")
    d.edge(
        f"M {store.x} {store.bottom[1] + 74} V {paper.top[1] - 8}",
        dotted=True,
        label="copy files",
        at=(store.x + 10, 446),
        anchor="start",
    )
    d.packet(f"M {gal.x} {gal.right[1]} H {store.x}", 5)
    d.packet(f"M {gal.x} {gal.bottom[1]} V {opn.left[1]} H {ed.x}", 6, 2.5)
    return d


def export_gate() -> Diagram:
    d = Diagram(
        "export-gate",
        730,
        title="Publication Score & Export Gate",
        deck="Trước khi tải PDF: nếu bản thảo đã đổi, chạy quick logic skim rồi chấm điểm + báo cáo AI disclosure",
        desk="FRONTEND DESK",
        fig="3.4",
        kicker="EXPORT",
        source="useEditorTools.ts · paper-score.ts",
        ticker=("GATE AUDIT: ABSTRACT · INTRO · CONCLUSION", "COMPUTEPAPERSCORE", "AI DISCLOSURE"),
    )
    big = {"hw": 38, "bh": 20, "title_size": 17}
    row = 370
    exp = d.block(110, row, code="PDF", title="Export", sub="mở hộp thoại xuất", **big)
    gate = d.block(310, row, code="?", title="Bản thảo đã đổi?", sub="so fingerprint", pulse=True, **big)
    skim = d.block(520, 250, code="L", title="Quick logic skim", sub="gate mode · /chat/stream", key=True, **big)
    score = d.block(720, row, code="%", title="computePaperScore", sub="4 dimensions", mono_title=True, **big)
    dialog = d.block(925, row, code="UI", title="Score dialog", sub="ring · dimensions", **big)
    disc = d.block(720, 572, code="AI", title="AI Disclosure", sub="GET …/ai-disclosure", **big)
    pdf = d.block(925, 572, code="PDF", title="Tải PDF", sub="khi PDF đã compile", **big)
    d.text(score.x, score.bottom[1] + 26 + 19 + 18, "structure · completeness", cls="u q", anchor="middle")
    d.text(score.x, score.bottom[1] + 26 + 19 + 36, "citations · logic", cls="u q", anchor="middle")
    d.link(exp, gate)
    d.link(gate, score, label="không")
    d.edge(
        f"M {gate.x} {gate.top[1] - 8} V {skim.left[1]} H {skim.left[0] - 10}",
        label="có",
        at=(gate.x + 12, skim.left[1] - 11),
        anchor="start",
    )
    d.edge(f"M {skim.right[0] + 8} {skim.right[1]} H {score.x} V {score.top[1] - 8}")
    d.link(score, dialog)
    d.edge(
        f"M {disc.right[0] + 8} {disc.right[1]} H 830 V {dialog.left[1] + 16} H {dialog.left[0] - 10}",
        label="report",
        at=(838, 512),
        anchor="start",
    )
    d.edge(f"M {dialog.x} {dialog.bottom[1] + 66} V {pdf.top[1] - 8}")
    y = exp.right[1]
    d.packet(f"M {exp.x} {y} H {gate.x} V {skim.left[1]} H {score.x} V {y} H {dialog.x}", 7)
    d.packet(f"M {exp.x} {y} H {dialog.x} V {pdf.cy}", 6, 3.5)
    return d


def defense_flow() -> Diagram:
    parts = [
        ("Researcher", "USR"),
        ("/defense", "UI"),
        ("defense_stream", "SSE"),
        ("defense_quota", "Q"),
        ("LLM persona", "AI"),
    ]
    msgs = [
        (0, 1, "Mở Defense từ project / editor", False),
        (1, 1, "Compile PDF preview", False),
        (0, 1, "Chọn chế độ Proactive hoặc Q&A", False),
        (1, 2, "POST /defense/stream  (Bearer)", False),
        (2, 3, "assert_defense_allowed — lượt theo tier", False),
        (2, 4, "council prompt + manuscript context", False),
        (4, 2, "streamed tokens", True),
        (2, 1, "SSE activity · token … done", True),
        (2, 3, "record_defense_turn (bỏ qua nếu disconnect)", False),
        (1, 1, "Highlight + deep-link trích dẫn trong PDF", False),
    ]
    return _sequence(
        "defense-flow",
        parts=parts,
        msgs=msgs,
        x_span=(150, 900),
        title="Defense Mode",
        deck="Phản biện thử (mock viva) — hội đồng AI đặt câu hỏi dựa trên chính bản thảo",
        desk="FRONTEND DESK",
        fig="3.5",
        kicker="DEFENSE",
        source="defense_stream.py · defense_quota.py",
        ticker=("SSE", "QUOTA PER TIER", "NO CHARGE ON DISCONNECT", "PDF DEEP-LINKS"),
        aria="Defense mode sequence between researcher, defense page, defense stream service, defense quota and "
        "LLM persona",
    )


# =============================================================================
# Integrity desk
# =============================================================================


def guardrails() -> Diagram:
    d = Diagram(
        "guardrails",
        1070,
        title="Guardrail Architecture",
        deck="4 lớp phòng vệ cho output của AI — vi phạm ở lớp 2 bị chặn trước khi tới tay tác giả",
        desk="INTEGRITY DESK",
        fig="4.1",
        kicker="GUARDRAILS",
        source="src/services/guardrails/ · docs/GUARDRAILS.md",
        ticker=("BLOCKING FLAGS", "AUDIT TRAIL", "QUOTA ON EVERY LLM PATH", "SANDBOXED COMPILE"),
    )
    lanes = [
        (212, 358, "L1", "PROMPT", "ràng buộc trước khi gọi LLM"),
        (358, 504, "L2", "OUTPUT CHECK", "kiểm tra output của LLM"),
        (504, 650, "L3", "DIFF DISPLAY", "không ghi đè âm thầm"),
        (650, 796, "L4", "AUDIT", "lưu vết mọi quyết định"),
    ]
    items = [
        [
            ("SYS", "System prompt", "prompts.default.yaml"),
            ("INJ", "Injection guard", "prompt_injection.py"),
            ("REQ", "Request guard", "prompt-leak refusal"),
        ],
        [
            ("NUM", "Numeric drift", "metric changes"),
            ("LEN", "Length / semantic", "rewrite bounds"),
            ("SCP", "Edit scope", "validate_proposed_edit"),
            ("SAN", "Output sanitize", "strip meta text"),
        ],
        [
            ("DIF", "Line diff", "no silent overwrite"),
            ("BLK", "Blocking flags", "Accept disabled"),
            ("ACC", "Accept / Reject", "Ctrl+Enter · Esc"),
        ],
        [
            ("REV", "Revision history", "suggestions table"),
            ("ACK", "Accept → API", "POST /revisions"),
            ("FPR", "Score fingerprint", "publication gate"),
            ("AI", "AI Disclosure", "contribution report"),
        ],
    ]
    spine = 66
    xs = (230, 420, 610, 800)
    for i, ((top, bottom, num, name, cap), row) in enumerate(zip(lanes, items, strict=True)):
        d.lane(top, bottom, num, name, cap, tint=i % 2 == 1, x0=spine + 16)
        cy = top + 58
        d.edge(f"M {spine} {cy + 7.5} H {xs[len(row) - 1]}", arrow=False, flow=False)
        for x, (code, title, sub) in zip(xs, row, strict=False):
            d.block(x, cy, code=code, title=title, sub=sub, key=(num == "L2" and code == "NUM"))
    d.add("edges", f'<path d="M {spine} 228 V 784" class="tk"/>')
    d.text(spine, 219, "LLM", cls="m q", anchor="middle")
    d.packet(f"M {spine} 228 V 784", 7)
    blk = (spine, 424)
    d.add(
        "packets",
        f'<g class="pk" opacity="0"><path d="M0,-5 L5,0 L0,5 L-5,0z" class="r"/>'
        f'<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.4;0.43;1" dur="7s" begin="3.5s" '
        f'repeatCount="indefinite"/><animateMotion path="M {spine} 228 V {blk[1]}" keyPoints="0;1;1" '
        f'keyTimes="0;0.4;1" calcMode="linear" dur="7s" begin="3.5s" repeatCount="indefinite"/></g>',
    )
    d.add(
        "packets",
        f'<g class="pk" opacity="0" transform="translate({blk[0]} {blk[1]})"><rect x="-14" y="-14" width="28" '
        f'height="28" class="r"/><path d="M -6 -6 L 6 6 M 6 -6 L -6 6" class="ln" style="stroke:var(--on)" '
        f'stroke-width="2.6"/><text x="22" y="5" class="m r h" font-size="14" font-weight="700">BLOCKED</text>'
        f'<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.4;0.43;0.75;0.8" dur="7s" '
        f'begin="3.5s" repeatCount="indefinite"/></g>',
    )

    # platform hardening sidebar
    y0 = 812
    d.panel(M, y0, W - 2 * M, 198, "PLATFORM HARDENING", "ngoài 4 lớp — bảo vệ hạ tầng & chi phí", red=True)
    notes = [
        ("LLM quota", "quota_policy.py trên mọi đường LLM"),
        ("TeX sandbox", "env allowlist · openin/openout = p"),
        ("Compile caps", "≤ 64 MB body/gzip · main_file an toàn"),
        ("Rate limit key", "user đã xác thực, không theo token"),
        ("Security headers", "nosniff · DENY · CSP · HSTS prod"),
        ("Share WS", "owner-only · bearer.<jwt> · caps"),
        ("Prod settings", "AUTH_SECRET_KEY ≥ 32 ký tự"),
        ("Billing · PDF", "demo checkout off · link http(s)"),
    ]
    for i, (title, desc) in enumerate(notes):
        colx = M + 20 + (i // 4) * 480
        y = y0 + 58 + (i % 4) * 36
        d.add("labels", f'<rect x="{colx}" y="{y - 10}" width="8" height="8" class="r"/>')
        d.text(colx + 18, y, title, cls="m i", weight=700)
        d.text(colx + 18 + mono_w(title) + 12, y, desc, cls="u q")
    return d


# =============================================================================
# Operations desk
# =============================================================================


def deployment() -> Diagram:
    d = Diagram(
        "deployment",
        810,
        title="Deployment",
        deck="Hai service trên Google Cloud Run (asia-east1) — custom domain, secrets qua Secret Manager",
        desk="OPERATIONS DESK",
        fig="5.1",
        kicker="DEPLOY",
        source="scripts/deploy-cloudrun-*.ps1",
        ticker=("CLOUD RUN", "HTTPS + HSTS", "/ready PROBE", "JSON LOGS · TRACE", "CI DOES NOT DEPLOY"),
    )
    d.panel(M, 214, 160, 534, "CLIENT")
    d.panel(214, 214, 430, 534, "GOOGLE CLOUD", "Cloud Run · asia-east1")
    d.panel(658, 214, 342, 128, "DATA")
    d.panel(658, 356, 342, 392, "EXTERNAL")
    big = {"hw": 40, "bh": 20, "title_size": 17}
    browser = d.block(120, 400, code="WEB", title="Browser", sub="researcher", **big)
    be = d.block(
        530,
        300,
        code="API",
        title="arionear-api",
        sub="FastAPI + TeX Live",
        sub2="api.arionear.id.vn",
        mono_title=True,
        key=True,
        **big,
    )
    d.text(be.x, be.bottom[1] + 26 + 19 + 36, "/health · /ready", cls="m q", anchor="middle")
    fe = d.block(
        320,
        470,
        code="SSR",
        title="arionear-web",
        sub="TanStack · Nitro",
        sub2="arionear.id.vn",
        mono_title=True,
        **big,
    )
    build = d.block(320, 650, code="CB", title="Cloud Build", sub="gcloud builds submit")
    secrets = d.block(530, 650, code="KEY", title="Secret Manager", sub="--set-secrets")
    right = {"label": "right"}
    db = d.block(700, 282, code="PG", title="PostgreSQL", sub="DIRECT_DATABASE_URL", **right)
    targets = [
        db,
        d.block(700, 430, code="LLM", title="LLM Providers", sub="Z.AI · Gemini · OpenRouter …", **right),
        d.block(700, 530, code="S2", title="Scholarly APIs", sub="arXiv · CrossRef · S2 · OpenAlex", **right),
        d.block(700, 630, code="@", title="SMTP · Google OAuth", sub="email verify · SSO", **right),
    ]
    # Pages come from arionear-web; the browser bundle calls arionear-api directly (VITE_API_URL, CORS).
    bx0, by0 = browser.right[0] + 8, browser.right[1]
    d.edge(
        f"M {bx0} {by0} H 238 V {be.left[1]} H {be.left[0] - 10}", label="REST · SSE · WS", at=(359, be.left[1] - 11)
    )
    d.edge(f"M {bx0} {by0} H 238 V {fe.left[1]} H {fe.left[0] - 10}")
    d.text(246, 452, "HTTPS", cls="m q")
    trunk = 651
    d.edge(f"M {be.right[0] + 8} {be.right[1]} H {trunk}", arrow=False)
    d.edge(f"M {trunk} {db.left[1]} V {targets[-1].left[1]}", arrow=False)
    for t in targets:
        d.edge(f"M {trunk} {t.left[1]} H {t.left[0] - 10}")
    d.edge(
        f"M {build.x} {build.top[1] - 8} V {fe.bottom[1] + 72}",
        dotted=True,
        label="image",
        at=(build.x + 10, 612),
        anchor="start",
    )
    d.edge(f"M {build.right[0] + 8} {build.right[1]} H 450 V {be.bottom[1] + 92}", dotted=True)
    d.edge(
        f"M {secrets.x} {secrets.top[1] - 8} V {be.bottom[1] + 92}",
        dotted=True,
        label="secrets",
        at=(secrets.x + 10, 560),
        anchor="start",
    )
    d.packet(f"M {browser.x} {by0} H 238 V {be.left[1]} H {be.x}", 5)
    d.packet(f"M {browser.x} {by0} H 238 V {fe.left[1]} H {fe.x}", 5, 2.5)
    for i, t in enumerate(targets):
        d.packet(f"M {be.x} {be.right[1]} H {trunk} V {t.left[1]} H {t.x}", 4, 1.2 + i * 0.9)
    return d


def ci_cd() -> Diagram:
    d = Diagram(
        "ci-cd",
        1102,
        title="CI/CD Pipeline",
        deck="Pre-commit gate cục bộ → GitHub Actions kiểm tra mọi push/PR; tag vX.Y.Z tạo Release — không deploy",
        desk="OPERATIONS DESK",
        fig="5.2",
        kicker="CI/CD",
        source=".github/workflows/ · .pre-commit-config.yaml",
        ticker=("NO DEPLOYMENT", "PUSH: FALSE", "PYTHON 3.11 + 3.12", "NODE 22", "WEEKLY CRON"),
        aria="CI/CD pipeline: pre-commit gate, push or pull request, then CI, Security, Docker and LaTeX workflows; "
        "a version tag creates a GitHub Release; Dependabot opens update PRs; nothing is deployed",
    )
    xs = cols(5, GUTTER, W - M)
    top = d.block
    dev = top(xs[0], 262, code="DEV", title="Developer", sub="git commit")
    pre = top(
        xs[1], 262, code="PC", title="pre-commit", sub="ruff · prettier · eslint", sub2="hygiene hooks", mono_title=True
    )
    push = top(xs[2], 262, code="GH", title="push · PR", sub="main · pull_request", key=True, pulse=True)
    mk = top(xs[3], 262, code="MK", title="make ci", sub="CI checks, cục bộ", mono_title=True)
    bot = top(xs[4], 262, code="BOT", title="Dependabot", sub="pip · npm weekly", sub2="actions monthly")
    d.link(dev, pre)
    d.link(pre, push)
    d.edge(
        f"M {mk.left[0] - 8} {mk.left[1]} H {push.right[0] + 10}",
        dotted=True,
        label="tuỳ chọn",
        at=((mk.x + push.x) / 2, mk.left[1] - 11),
    )
    d.edge(
        f"M {bot.x} {bot.top[1] - 8} V 226 H {push.x + 12} V {push.top[1] - 10}",
        dotted=True,
        label="update PRs",
        at=((bot.x + push.x) / 2, 220),
    )

    spine = M + 18
    tops = (382, 550, 718, 886)
    bands = [
        ("CI", "ci.yml — push main · PR"),
        ("SECURITY", "security.yml — push · PR · weekly"),
        ("DOCKER", "docker.yml — path filters · weekly"),
        ("LATEX · RELEASE", "latex.yml · release.yml — tag v*.*.*"),
    ]
    for i, (t, (name, cap)) in enumerate(zip(tops, bands, strict=True)):
        d.lane(t, t + 162, f"{i + 1:02d}", name, cap, tint=i % 2 == 1, x0=spine + 14)
    d.edge(f"M {push.x} {push.bottom[1] + 54} V 368 H {spine} V {tops[-1] + 40}", arrow=False)

    def band(t, jobs, *, chain=()):
        cy = t + 74
        boxes = [
            d.block(x, cy, code=code, title=title, sub=sub, mono_title=mono, muted=code == "∅")
            for x, (code, title, sub, mono) in zip(xs, jobs, strict=False)
        ]
        feed = [b for i, b in enumerate(boxes) if i not in {j for _a, j in chain}]
        d.drops(t + 40, feed, x_from=spine)
        for a, b in chain:
            d.link(boxes[a], boxes[b])
        return boxes

    ci = band(
        tops[0],
        [
            ("RUF", "Ruff", "check · format", False),
            ("PY", "pytest", "3.11 + 3.12 · coverage", True),
            ("FE", "Frontend", "lint · tsc · vitest · build", False),
            ("DB", "Prisma", "migrate deploy · drift", False),
            ("PG", "Postgres 16", "service container", False),
        ],
        chain=((3, 4),),
    )
    sec = band(
        tops[1],
        [
            ("CQL", "CodeQL", "python · js/ts", False),
            ("PIP", "pip-audit", "requirements.txt", True),
            ("NPM", "npm audit", "prod deps · high", True),
            ("GL", "gitleaks", "secret scan", True),
            ("DEP", "Dep. review", "pull requests only", False),
        ],
    )
    band(
        tops[2],
        [
            ("API", "API image", "FastAPI + TeX Live", False),
            ("OK", "Smoke test", "/health · /compile/status", False),
            ("WEB", "Web image", "TanStack · Nitro", False),
            ("OK", "Smoke test", "GET / → HTML", False),
            ("∅", "Nothing pushed", "push: false", False),
        ],
        chain=((0, 1), (2, 3)),
    )
    last = band(
        tops[3],
        [
            ("TEX", "TeX Live", "apt texlive-*", False),
            ("PY", "pytest", "full suite · no skips", True),
            ("TAG", "tag vX.Y.Z", "git push --tags", True),
            ("GH", "gh release", "--generate-notes", True),
            ("REL", "GitHub Release", "không deploy", False),
        ],
        chain=((0, 1), (2, 3), (3, 4)),
    )
    d.line(xs[1] + 92, tops[3] + 52, xs[1] + 92, tops[3] + 156, opacity=0.4, layer="lanes")
    head = f"M {push.x} {push.cy} V 368 H {spine}"
    d.packet(f"M {dev.x} {dev.right[1]} H {push.x} V 368 H {spine} V {tops[0] + 40} H {xs[4]} V {ci[4].cy}", 10)
    d.packet(f"{head} V {tops[1] + 40} H {xs[2]} V {sec[2].cy}", 9, 3)
    d.packet(f"{head} V {tops[3] + 40} H {xs[2]} V {last[2].cy} H {xs[4]}", 10, 6)
    return d


# =============================================================================
# Product desk (README overview figures)
# =============================================================================


def _chip(d: Diagram, x: float, y: float, w: float, label: str, *, h: float = 30, bullet: bool = True) -> None:
    """Newsprint chip with an ink rule and a hard shadow, like the app's cards."""
    d.add(
        "blocks",
        f'<rect x="{x + 3:.1f}" y="{y + 3:.1f}" width="{w:.1f}" height="{h}" class="sh"/>'
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h}" class="t e"/>',
    )
    tx = x + 12
    if bullet:
        d.add("blocks", f'<rect x="{x + 12:.1f}" y="{y + h / 2 - 3:.1f}" width="6" height="6" class="r"/>')
        tx = x + 26
    d.text(tx, y + h / 2 + 5, label)


def _chip_w(label: str) -> float:
    return len(label) * 7.6 + 24


def features() -> Diagram:
    d = Diagram(
        "features",
        640,
        title="Tính năng",
        deck="Ario gợi ý như một biên tập viên — mọi thay đổi chờ tác giả Chấp nhận / Từ chối",
        desk="PRODUCT DESK",
        fig="0.1",
        kicker="FEATURES",
        source="frontend/ · src/services/",
        ticker=("HUMAN-IN-THE-LOOP", "LATEX-NATIVE", "MULTI-LLM", "EN / VI"),
    )
    columns = (
        (
            "ARIO",
            "Biên tập với Ario",
            True,
            (
                "Style · văn phong",
                "Structure · IMRaD",
                "Template · section thiếu",
                "Citation · L1 → L4",
                "Quick Edit · Ctrl+K",
                "Slash command · SSE",
            ),
        ),
        (
            "QA",
            "Đánh giá chất lượng",
            False,
            (
                "Logic Audit · Quick / Deep",
                "Publication Score Gate",
                "Defense Mode · mock viva",
                "Integrity Monitor",
                "Peer-review reply",
                "AI disclosure · EN / VI",
            ),
        ),
        (
            "TEX",
            "Môi trường LaTeX",
            False,
            (
                "Editor đa file + outline",
                "TeX Live + SyncTeX",
                "Import ZIP · DOCX · PDF",
                "IEEE · LNCS · Elsevier",
                "PDF.js preview",
                "Link chia sẻ read-only",
            ),
        ),
        (
            "APP",
            "Nền tảng",
            False,
            (
                "JWT + Google SSO",
                "Admin console · quota",
                "Gói FREE / PRO",
                "Chọn model · failover",
                "Song ngữ EN / VI",
                "Dark mode · mobile",
            ),
        ),
    )
    xs = cols(4, M, W - M)
    col_w = (W - 2 * M) / 4
    for i in range(1, 4):
        d.line(M + col_w * i, 222, M + col_w * i, 576, opacity=0.3)
    for x, (code, title, key, items) in zip(xs, columns, strict=True):
        d.block(x, 262, hw=34, bh=20, code=code, key=key, pulse=key)
        d.text(x, 342, title, size=19, cls="d i", weight=700, anchor="middle")
        chip_w = col_w - 22
        for j, item in enumerate(items):
            _chip(d, x - chip_w / 2, 362 + j * 36, chip_w, item)
    return d


def tech_stack() -> Diagram:
    d = Diagram(
        "tech-stack",
        830,
        title="Tech stack",
        deck="Mỗi tầng dùng công cụ đã được kiểm chứng — không tự xây lại thứ đã có sẵn",
        desk="ENGINEERING DESK",
        fig="1.0",
        kicker="STACK",
        source="requirements.txt · frontend/package.json",
        ticker=("PYTHON 3.11+", "NODE 22", "POSTGRES 16", "TEX LIVE", "DOCKER"),
    )
    layers = (
        ("UI", "FRONTEND", ("TanStack Start", "React 19", "shadcn/ui", "Tailwind CSS v4", "Vite", "PDF.js")),
        ("API", "BACKEND", ("FastAPI", "Python 3.11+", "LangGraph", "SQLAlchemy", "SSE", "WebSocket")),
        ("LLM", "LLM", ("Gemini", "OpenRouter", "OpenAI", "Anthropic", "Z.AI GLM")),
        ("TEX", "LATEX", ("TeX Live", "pdflatex", "SyncTeX", "PDF cache")),
        ("DB", "DATA", ("PostgreSQL 16", "Prisma migrations")),
        ("OPS", "INFRA", ("Docker", "Cloud Run", "GitHub Actions")),
        ("OBS", "OBSERVABILITY", ("JSON logs", "Request ID", "LangSmith", "Inngest")),
    )
    x_stack, hw, bh, gap, cy0 = 170, 54, 12, 76, 262
    label_x = 290
    # Exploded stack: draw the bottom slab first so each upper slab sits in front of the one below.
    for i in reversed(range(len(layers))):
        code = layers[i][0]
        d.block(x_stack, cy0 + i * gap, hw=hw, bh=bh, code=code, key=code == "LLM")
    for i, (_, name, chips) in enumerate(layers):
        cy = cy0 + i * gap
        d.edge(f"M {x_stack + hw + 8} {cy + bh / 2:.1f} H {label_x - 10}", arrow=False, dotted=True)
        d.text(label_x, cy - 10, f"{i + 1:02d}", cls="m r", weight=700)
        d.text(label_x + 30, cy - 10, name, cls="m k i", weight=700)
        x = label_x
        for chip in chips:
            w = _chip_w(chip)
            _chip(d, x, cy + 2, w, chip, h=28, bullet=False)
            x += w + 10
    return d


DIAGRAMS = {
    "features": features,
    "tech-stack": tech_stack,
    "request-flow": request_flow,
    "architecture": architecture,
    "sequence": sequence,
    "langgraph": langgraph,
    "persistence": persistence,
    "guardrails": guardrails,
    "deployment": deployment,
    "system-overview": system_overview,
    "frontend-routes": frontend_routes,
    "api-surface": api_surface,
    "sse-chat": sse_chat,
    "defense-flow": defense_flow,
    "export-gate": export_gate,
    "template-gallery": template_gallery,
    "auth-session": auth_session,
    "citation-verifier": citation_verifier,
    "ci-cd": ci_cd,
}


def main(argv: list[str]) -> int:
    names = argv or list(DIAGRAMS)
    unknown = [n for n in names if n not in DIAGRAMS]
    if unknown:
        print(f"Unknown diagram(s): {', '.join(unknown)}. Available: {', '.join(DIAGRAMS)}")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name in names:
        path = DIAGRAMS[name]().save()
        print(f"wrote {path.relative_to(OUT_DIR.parents[1])} ({path.stat().st_size / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
