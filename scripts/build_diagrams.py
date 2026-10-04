#!/usr/bin/env python3
"""Build the animated isometric SVG diagrams embedded in README.md and ARCHITECTURE.md.

Every diagram is generated from the declarative definitions below, so layout tweaks
stay consistent across all of them. Output goes to ``docs/assets/*.svg``.

Usage:
    python scripts/build_diagrams.py            # build every diagram
    python scripts/build_diagrams.py sequence   # build only the named diagram(s)

The SVGs are self-contained (no external fonts/scripts) and animate with CSS + SMIL,
which GitHub renders in Markdown. ``prefers-reduced-motion`` disables CSS motion.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from html import escape
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "docs" / "assets"

ISO = math.tan(math.radians(30))  # vertical / horizontal ratio of an isometric top face
FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
MONO = "ui-monospace, SFMono-Regular, 'Cascadia Code', Consolas, Menlo, monospace"

BLUE, SKY, VIOLET, AMBER = "#60A5FA", "#38BDF8", "#A78BFA", "#FBBF24"
RED, PINK, TEAL, GREEN, SOFTBLUE = "#F87171", "#F472B6", "#2DD4BF", "#34D399", "#93C5FD"
EDGE, EDGE_BASE, MUTED, TEXT, SUBTEXT = "#94A3B8", "#334155", "#64748B", "#F1F5F9", "#94A3B8"

CSS = (
    ".flow{stroke-dasharray:6 8;animation:dash 1.1s linear infinite}"
    "@keyframes dash{to{stroke-dashoffset:-28}}"
    ".float{animation:float 5s ease-in-out infinite}"
    "@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}"
    ".pulse{transform-box:fill-box;transform-origin:center;animation:pulse 2.6s ease-out infinite}"
    "@keyframes pulse{0%{opacity:.85;transform:scale(1)}100%{opacity:0;transform:scale(1.45)}}"
    "@media (prefers-reduced-motion:reduce){.flow,.float,.pulse{animation:none}}"
)


def shade(hex_color: str, factor: float) -> str:
    """Darken (factor < 1) or lighten (factor > 1) a hex colour."""
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    if factor >= 1:
        r, g, b = (int(c + (255 - c) * (factor - 1)) for c in (r, g, b))
    else:
        r, g, b = (int(c * factor) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def pts(*points: tuple[float, float]) -> str:
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


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
    """Collects SVG fragments in z-ordered layers and writes the final file."""

    LAYERS = ("bg", "lanes", "edges", "packets", "blocks", "labels")

    def __init__(
        self,
        name: str,
        width: int,
        height: int,
        title: str,
        subtitle: str,
        pills: tuple[tuple[str, str], ...] = (),
        glows: tuple[tuple[float, float, float, str, float], ...] = ((0.7, 0.3, 0.6, "#7C3AED", 0.2),),
        aria: str = "",
        margin: int = 64,
        header_fade: int = 200,
    ) -> None:
        self.name, self.w, self.h = name, width, height
        self.aria = aria or title
        self.defs: list[str] = []
        self.layers: dict[str, list[str]] = {k: [] for k in self.LAYERS}
        self._grads: dict[str, str] = {}
        self._blocks = 0
        self._background(glows, header_fade)
        self._header(title, subtitle, pills, margin)

    # ---- primitives ---------------------------------------------------------
    def add(self, layer: str, fragment: str) -> None:
        self.layers[layer].append(fragment)

    def text(self, x, y, s, *, size=14, fill=TEXT, weight=400, anchor="start", mono=False, layer="labels", extra=""):
        family = MONO if mono else FONT
        self.add(
            layer,
            f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" font-family="{family}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}"{extra}>{escape(s)}</text>',
        )

    def _top_gradient(self, accent: str) -> str:
        if accent not in self._grads:
            gid = f"g{len(self._grads)}"
            self._grads[accent] = gid
            self.defs.append(
                f'<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{shade(accent, 1.35)}"/>'
                f'<stop offset="1" stop-color="{accent}"/></linearGradient>'
            )
        return self._grads[accent]

    def _background(self, glows, header_fade: int) -> None:
        w, h = self.w, self.h
        self.defs += [
            '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1222"/>'
            '<stop offset="1" stop-color="#151E3A"/></linearGradient>',
            '<linearGradient id="headfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1222" stop-opacity="0.95"/>'
            '<stop offset="0.55" stop-color="#0D1428" stop-opacity="0.6"/><stop offset="1" stop-color="#0F1730" stop-opacity="0"/></linearGradient>',
            f'<clipPath id="card"><rect width="{w}" height="{h}" rx="28"/></clipPath>',
            '<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>',
            '<filter id="dotglow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.6" result="b"/>'
            '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" '
            'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748B"/></marker>',
        ]
        bg = [f'<g clip-path="url(#card)"><rect width="{w}" height="{h}" fill="url(#bg)"/>']
        step = 46
        for k in range(-int(h / ISO / step) - 2, int(w / step) + int(h / ISO / step) + 2):
            x0 = k * step
            for sgn in (1, -1):
                bg.append(
                    f'<line x1="{x0}" y1="0" x2="{x0 + sgn * h / ISO:.1f}" y2="{h}" stroke="#1E293B" stroke-width="1" opacity="0.5"/>'
                )
        for i, (cx, cy, r, color, alpha) in enumerate(glows):
            self.defs.append(
                f'<radialGradient id="glow{i}" cx="{cx}" cy="{cy}" r="{r}"><stop offset="0" stop-color="{color}" stop-opacity="{alpha}"/>'
                f'<stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient>'
            )
            bg.append(f'<rect width="{w}" height="{h}" fill="url(#glow{i})"/>')
        bg.append(f'<rect width="{w}" height="{header_fade}" fill="url(#headfade)"/></g>')
        bg.append(f'<rect x="0.5" y="0.5" width="{w - 1}" height="{h - 1}" rx="28" fill="none" stroke="#24304D"/>')
        self.add("bg", "".join(bg))

    def _header(self, title: str, subtitle: str, pills, margin: int) -> None:
        self.text(margin, 78, title, size=30, fill="#F8FAFC", weight=700, layer="bg")
        self.text(margin, 110, subtitle, size=15.5, fill=SUBTEXT, layer="bg")
        x = self.w - margin
        for label, color in reversed(pills):
            pw = 22 + len(label) * 7.6
            x -= pw
            self.add(
                "bg",
                f'<rect x="{x:.1f}" y="58" width="{pw:.1f}" height="28" rx="14" fill="#111A30" stroke="#2A3656"/>'
                f'<circle cx="{x + 14:.1f}" cy="72" r="4" fill="{color}"/>',
            )
            self.text(x + 24, 76.5, label, size=12.5, fill="#CBD5E1", layer="bg")
            x -= 10

    # ---- building blocks ----------------------------------------------------
    def lane(self, top, bottom, accent, number, name, caption, x0=32, x1=None) -> None:
        x1 = self.w - 32 if x1 is None else x1
        mid = (top + bottom) / 2
        self.add(
            "lanes",
            f'<rect x="{x0}" y="{top}" width="{x1 - x0}" height="{bottom - top}" rx="18" fill="{accent}" '
            f'fill-opacity="0.045" stroke="{accent}" stroke-opacity="0.22"/>'
            f'<rect x="{x0}" y="{top}" width="4" height="{bottom - top}" rx="2" fill="{accent}" fill-opacity="0.8"/>',
        )
        self.text(x0 + 24, mid - 10, number, size=12, fill=accent, weight=700, mono=True, layer="lanes")
        self.text(
            x0 + 24, mid + 9, name, size=14.5, fill="#E2E8F0", weight=700, layer="lanes", extra=' letter-spacing="0.6"'
        )
        if caption:
            self.text(x0 + 24, mid + 27, caption, size=12, fill="#7C8BA3", layer="lanes")

    def panel(self, x, y, w, h, accent, title, caption=None) -> None:
        self.add(
            "lanes",
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{accent}" fill-opacity="0.05" '
            f'stroke="{accent}" stroke-opacity="0.3" stroke-dasharray="4 5"/>',
        )
        self.text(x + 18, y + 26, title, size=12.5, fill=accent, weight=700, mono=True, layer="lanes")
        if caption:
            self.text(x + w - 18, y + 26, caption, size=11.5, fill="#7C8BA3", anchor="end", layer="lanes")

    def edge(
        self, d, *, color=EDGE, arrow=True, dotted=False, label=None, label_at=None, label_anchor="middle"
    ) -> None:
        marker = ' marker-end="url(#arrow)"' if arrow else ""
        if dotted:
            self.add(
                "edges",
                f'<path d="{d}" fill="none" stroke="{color}" stroke-opacity="0.7" stroke-width="1.8" stroke-dasharray="2 6" '
                f'stroke-linecap="round"{marker}/>',
            )
        else:
            self.add("edges", f'<path d="{d}" fill="none" stroke="{EDGE_BASE}" stroke-width="2"/>')
            self.add(
                "edges",
                f'<path class="flow" d="{d}" fill="none" stroke="{color}" stroke-opacity="0.9" stroke-width="2"{marker}/>',
            )
        if label and label_at:
            self.text(*label_at, label, size=11.5, fill=MUTED, anchor=label_anchor, mono=True, layer="edges")

    def packet(self, path, color, dur, begin=0.0, *, radius=4.5, key_points=None, key_times=None, fade=True) -> None:
        motion = f'dur="{dur}s" begin="{begin}s" repeatCount="indefinite" path="{path}"'
        if key_points:
            motion += f' keyPoints="{key_points}" keyTimes="{key_times}" calcMode="linear"'
        anim = f"<animateMotion {motion}/>"
        if fade:
            anim += (
                f'<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.92;1" dur="{dur}s" '
                f'begin="{begin}s" repeatCount="indefinite"/>'
            )
        opacity = ' opacity="0"' if fade else ""
        self.add("packets", f'<circle r="{radius}" fill="{color}" filter="url(#dotglow)"{opacity}>{anim}</circle>')

    def block(
        self,
        x,
        cy,
        accent,
        *,
        hw=32,
        bh=18,
        code=None,
        title=None,
        sub=None,
        sub2=None,
        label="below",
        label_y=None,
        title_size=14,
        sub_size=11.5,
        sub_color=SUBTEXT,
        number=None,
        cluster=False,
        glyphs=False,
        pulse=False,
        float_=True,
    ) -> Box:
        box = Box(x, cy, hw, bh)
        hh = box.hh
        g: list[str] = [
            f'<ellipse cx="{x}" cy="{cy + hh + bh + 4:.1f}" rx="{hw * 0.95:.1f}" ry="{hh * 0.52:.1f}" fill="#000" '
            f'opacity="0.45" filter="url(#soft)"/>'
        ]
        if pulse:
            ring = pts((x, cy - hh - 6), (x + hw + 10, cy), (x, cy + hh + 6), (x - hw - 10, cy))
            g.append(
                f'<polygon class="pulse" points="{ring}" fill="none" stroke="{shade(accent, 1.3)}" stroke-width="2"/>'
            )
        delay = (self._blocks * 0.37) % 5
        self._blocks += 1
        g.append(f'<g class="float" style="animation-delay:-{delay:.2f}s">' if float_ else "<g>")
        top = pts((x, cy - hh), (x + hw, cy), (x, cy + hh), (x - hw, cy))
        g.append(
            f'<polygon points="{pts((x - hw, cy), (x, cy + hh), (x, cy + hh + bh), (x - hw, cy + bh))}" fill="{shade(accent, 0.62)}"/>'
        )
        g.append(
            f'<polygon points="{pts((x, cy + hh), (x + hw, cy), (x + hw, cy + bh), (x, cy + hh + bh))}" fill="{shade(accent, 0.42)}"/>'
        )
        g.append(f'<polygon points="{top}" fill="url(#{self._top_gradient(accent)})"/>')
        g.append(
            f'<polyline points="{pts((x - hw, cy), (x, cy + hh), (x + hw, cy))}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.1"/>'
        )
        g.append(f'<polygon points="{top}" fill="none" stroke="#fff" stroke-opacity="0.22"/>')
        if number is not None:
            s = 0.9 if hw <= 70 else 1.25
            ny = cy + (28 if cluster else 0)
            g.append(self._iso_text(x, ny, f"{number:02d}", 26, "#0B1222", s, 0.72, FONT))
        if code:
            g.append(self._iso_text(x, cy, code, 12.5 if len(code) > 2 else 14, "#0B1222", 1.0, 0.75, MONO))
        if cluster:
            g.extend(self._cluster(box, accent, big=hw >= 90))
        if glyphs:
            g.append(self._iso_text(x - 14, cy - 8, "✓", 22, "#064E3B", 1.0, 0.85, FONT))
            g.append(self._iso_text(x + 14, cy + 8, "✕", 20, "#7F1D1D", 1.0, 0.8, FONT))
        g.append("</g>")
        self.add("blocks", "".join(g))

        if title and label == "below":
            ly = label_y if label_y is not None else cy + hh + bh + (34 if title_size > 15 else 22)
            self.text(x, ly, title, size=title_size, weight=650, anchor="middle")
            gap = 22 if title_size > 15 else 16
            if sub:
                self.text(x, ly + gap, sub, size=sub_size, fill=sub_color, anchor="middle")
            if sub2:
                self.text(x, ly + gap + 15, sub2, size=sub_size, fill=sub_color, anchor="middle")
        elif title and label in ("left", "right"):
            lx = x - hw - 24 if label == "left" else x + hw + 24
            anchor = "end" if label == "left" else "start"
            self.text(lx, cy - 3, title, size=title_size, weight=650, anchor=anchor)
            if sub:
                self.text(lx, cy + 16, sub, size=sub_size, fill=sub_color, anchor=anchor)
        return box

    @staticmethod
    def _iso_text(cx, cy, text, size, fill, scale, opacity, family) -> str:
        s = scale
        return (
            f'<g transform="matrix({0.866 * s:.3f} {0.5 * s:.3f} {-0.866 * s:.3f} {0.5 * s:.3f} {cx} {cy})">'
            f'<text x="0" y="{size * 0.36:.1f}" text-anchor="middle" font-family="{family}" font-size="{size}" '
            f'font-weight="800" fill="{fill}" fill-opacity="{opacity}">{escape(text)}</text></g>'
        )

    @staticmethod
    def _cluster(box: Box, accent: str, big: bool) -> list[str]:
        """Six mini cubes on a platform — one per Ario agent."""
        if big:
            grid, mw, mhgt, lift = [(-50, -50), (-20, -50), (-50, -20), (10, -50), (-50, 10), (-20, -20)], 12, 9, 4
        else:
            grid, mw, mhgt, lift = [(u, v) for u in (-15, 0, 15) for v in (-9, 9)], 7, 6, 3
        cubes = sorted(((0.866 * (u - v), 0.5 * (u + v)) for u, v in grid), key=lambda t: t[1])
        out = []
        for dx, dy in cubes:
            mx, my = box.x + dx, box.cy + dy - lift
            mh = mw * ISO
            out.append(
                f'<polygon points="{pts((mx - mw, my), (mx, my + mh), (mx, my + mh + mhgt), (mx - mw, my + mhgt))}" fill="{shade(accent, 0.5)}"/>'
            )
            out.append(
                f'<polygon points="{pts((mx, my + mh), (mx + mw, my), (mx + mw, my + mhgt), (mx, my + mh + mhgt))}" fill="{shade(accent, 0.35)}"/>'
            )
            out.append(
                f'<polygon points="{pts((mx, my - mh), (mx + mw, my), (mx, my + mh), (mx - mw, my))}" fill="{shade(accent, 1.55)}"/>'
            )
        return out

    # ---- output -------------------------------------------------------------
    def save(self) -> Path:
        body = "".join("".join(self.layers[k]) for k in self.LAYERS)
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" '
            f'role="img" aria-label="{escape(self.aria)}"><defs>{"".join(self.defs)}</defs><style>{CSS}</style>{body}</svg>\n'
        )
        path = OUT_DIR / f"{self.name}.svg"
        path.write_text(svg, encoding="utf-8", newline="\n")
        return path


# =============================================================================
# Diagrams
# =============================================================================


def request_flow() -> Diagram:
    d = Diagram(
        "request-flow",
        1280,
        760,
        "Request Flow",
        "Từ một câu chat đến bản thảo đã duyệt — mọi đề xuất của Ario đều qua guardrail và Human Gate",
        pills=(("SSE streaming", GREEN), ("Guardrail L1–L2", RED), ("Human-in-the-loop", TEAL)),
        glows=((0.72, 0.3, 0.6, "#7C3AED", 0.22), (0.2, 0.85, 0.5, "#0EA5E9", 0.16)),
        aria="Arionear request flow: Editor, FastAPI, Intent Router, Ario Agents, LLM Providers, Integrity Monitor, "
        "Human Gate, PDF compile",
        header_fade=240,
    )
    row1, row2, cols = 250, 570, (150, 410, 670, 960)
    big = {"hw": 70, "bh": 34, "title_size": 17, "sub_size": 13}
    b1 = d.block(cols[0], row1, BLUE, number=1, title="Editor", sub="React 19 · LaTeX", **big)
    b2 = d.block(cols[1], row1, GREEN, number=2, title="FastAPI", sub="REST · SSE · WebSocket", **big)
    b3 = d.block(cols[2], row1, AMBER, number=3, title="Intent Router", sub="rules → LLM classifier", **big)
    b4 = d.block(cols[3], row1, VIOLET, number=4, cluster=True, hw=110, bh=34, title="Ario Agents", title_size=17)
    b5 = d.block(cols[3], row2, PINK, number=5, title="LLM Providers", sub="Gemini · GPT · Claude · GLM", **big)
    b6 = d.block(cols[2], row2, RED, number=6, title="Integrity Monitor", sub="numeric drift · length", **big)
    b7 = d.block(cols[1], row2, TEAL, number=7, title="Human Gate", sub="Accept ✓  /  Reject ✕", **big)
    b8 = d.block(cols[0], row2, SKY, number=8, title="PDF + SyncTeX", sub="TeX Live compile", **big)

    # agent pills under the platform
    base = b4.bottom[1]
    for i, name in enumerate(["Style", "Edit", "Structure", "Citation", "Template", "Logic"]):
        col, row = i % 3, i // 3
        px, py = b4.x + (col - 1) * 88 - 40, base + 50 + row * 32
        d.add(
            "labels",
            f'<rect x="{px:.1f}" y="{py:.1f}" width="80" height="24" rx="12" fill="#1B1640" stroke="{VIOLET}" stroke-opacity="0.55"/>',
        )
        d.text(px + 40, py + 16.5, name, size=12.5, fill="#DDD6FE", anchor="middle")

    for a, b, label in [(b1, b2, "/chat/stream"), (b2, b3, "classify"), (b3, b4, "dispatch")]:
        x1, y = a.right
        x2 = b.left[0]
        d.edge(f"M {x1 + 6} {y} H {x2 - 12}", label=label, label_at=((x1 + x2) / 2, y - 12))
    for a, b, label in [(b5, b6, "edits[]"), (b6, b7, "diff · flags"), (b7, b8, "accept")]:
        x1, y = a.left
        x2 = b.right[0]
        d.edge(f"M {x1 - 6} {y} H {x2 + 12}", label=label, label_at=((x1 + x2) / 2, y - 12))
    (x1, y1), (x2, y2) = b4.right, b5.right
    d.edge(f"M {x1 + 6} {y1} H 1170 V {y2} H {x2 + 12}")
    d.add(
        "edges",
        f'<g transform="translate(1182 {(y1 + y2) / 2}) rotate(90)"><text x="0" y="0" text-anchor="middle" '
        f'font-family="{MONO}" font-size="11.5" fill="{MUTED}">prompt · L1</text></g>',
    )
    d.packet(f"M {cols[0]} {b1.right[1]} H 1170 V {b5.right[1]} H {cols[0]}", "#E9D5FF", 9, radius=5, fade=False)
    return d


def architecture() -> Diagram:
    d = Diagram(
        "architecture",
        1280,
        920,
        "System Architecture",
        "5 tầng xử lý — mọi đề xuất của AI đều phải qua Human Gate trước khi trở thành output",
        pills=(("LaTeX-native", BLUE), ("Human-in-the-loop", TEAL), ("Multi-LLM failover", PINK)),
        glows=((0.62, 0.35, 0.55, "#7C3AED", 0.18), (0.75, 0.62, 0.35, "#14B8A6", 0.16)),
        aria="Arionear system architecture: user, processing, human gate, output and infrastructure layers",
        margin=56,
        header_fade=170,
    )
    col = (310, 445, 580, 725, 870, 1005, 1150)
    lanes = [
        (150, 278, BLUE, "01", "USER", "Tác giả & đầu vào"),
        (292, 462, VIOLET, "02", "PROCESSING", "Router · Ario agents"),
        (476, 604, TEAL, "03", "HUMAN GATE", "Duyệt từng thay đổi"),
        (620, 748, AMBER, "04", "OUTPUT", "Bản thảo & báo cáo"),
        (762, 890, GREEN, "05", "INFRASTRUCTURE", "Runtime & dữ liệu"),
    ]
    for lane in lanes:
        d.lane(*lane)

    def node(x, cy, accent, code, title, sub, ly, **kw):
        return d.block(x, cy, accent, code=code, title=title, sub=sub, label_y=ly, **kw)

    u_y, p_y, o_y, i_y = 190, 342, 658.5, 802
    upload = node(col[0], u_y, BLUE, "ZIP", "LaTeX Upload", "Overleaf ZIP · Templates", 248)
    researcher = node(col[1], u_y, SOFTBLUE, "USR", "Researcher", "tác giả bài báo", 248)
    chat = node(col[2], u_y, BLUE, "MSG", "Chat Intent", "Style · Edit · Logic…", 248)
    defense = node(col[6], u_y, PINK, "QA", "Defense Mode", "mock viva", 248)
    parser = node(col[0], p_y, VIOLET, "TEX", "Document Parser", "LaTeX → sections", 412)
    store = node(col[1], p_y, VIOLET, "DB", "Paper Store", "PostgreSQL + cache", 412)
    router = node(col[2], p_y, AMBER, "IR", "Intent Router", "rules → LLM", 412)
    agents = d.block(
        col[3],
        p_y,
        VIOLET,
        hw=48,
        bh=20,
        cluster=True,
        title="Ario Agents",
        sub="Style · Edit · Structure",
        sub2="Citation · Template · Logic",
        sub_color="#C4B5FD",
        label_y=412,
    )
    integrity = node(col[4], p_y, RED, "L2", "Integrity Monitor", "guardrail L2", 412)
    score = node(col[5], p_y, SKY, "%", "Publication Score", "pre-export gate", 412)
    council = node(col[6], p_y, PINK, "AI", "Defense Council", "AI reviewers", 412)
    diff = d.block(
        col[4],
        528.6,
        TEAL,
        hw=60,
        glyphs=True,
        pulse=True,
        label="left",
        title="Diff View · Accept / Reject",
        sub="tác giả duyệt từng thay đổi — AI không tự áp dụng",
        title_size=15,
        sub_size=12,
    )
    outputs = [
        node(col[0], o_y, AMBER, "DOC", "Revised Draft", "accepted edits", 716.5),
        node(col[1], o_y, AMBER, "!", "Integrity Flags", "drift · scope", 716.5),
        node(col[2], o_y, AMBER, "REF", "Citation Report", "verify per key", 716.5),
        node(col[3], o_y, AMBER, "LOG", "Logic Audit", "conflicts · claims", 716.5),
        node(col[4], o_y, AMBER, "AUD", "Audit Log", "every decision", 716.5),
    ]
    transcript = node(col[6], o_y, PINK, "TXT", "Defense Transcript", "Q&A history", 716.5)
    for x, accent, code, title, sub in [
        (col[0], GREEN, "API", "FastAPI", "REST · SSE · WS"),
        (col[1], GREEN, "LG", "LangGraph", "chat_stream"),
        (col[2], PINK, "LLM", "LLM Providers", "Gemini · GPT · Claude"),
        (col[3], BLUE, "PG", "PostgreSQL", "Prisma schema"),
        (col[4], GREEN, "EXT", "External APIs", "arXiv · CrossRef · S2"),
        (col[5], GREEN, "ADM", "Admin Console", "users · LLM keys"),
        (col[6], GREEN, "$", "Billing", "FREE / PRO quotas"),
    ]:
        node(x, i_y, accent, code, title, sub, 860)

    def below(box: Box, extra=0.0) -> float:  # just under a block's two-line label
        return {u_y: 248, p_y: 412, o_y: 716.5}[box.cy] + 26 + extra

    def h(a: Box, b: Box, **kw):
        (x1, y), x2 = a.right, b.left[0]
        d.edge(f"M {x1 + 5:.1f} {y:.1f} H {x2 - 10:.1f}", **kw)

    (x1, y), x2 = researcher.left, upload.right[0]
    d.edge(f"M {x1 - 5:.1f} {y:.1f} H {x2 + 10:.1f}")
    h(researcher, chat)
    d.edge(f"M {researcher.x} {researcher.top[1] - 4:.1f} V 162 H {defense.x} V {defense.top[1] - 8:.1f}")
    for a, b in [(upload, parser), (chat, router), (defense, council)]:
        d.edge(f"M {a.x} {below(a)} V {b.top[1] - 8:.1f}")
    for a, b in [(parser, store), (store, router), (router, agents), (agents, integrity), (integrity, score)]:
        h(a, b)
    d.edge(f"M {integrity.x} {below(integrity)} V {diff.top[1] - 8:.1f}")
    d.edge(f"M {score.x} {below(score)} V {diff.right[1]:.1f} H {diff.right[0] + 10:.1f}")
    bus = 612
    d.edge(f"M {diff.x} {diff.bottom[1] + 4:.1f} V {bus}", color="#5EEAD4", arrow=False)
    d.edge(f"M {col[0]} {bus} H {diff.x}", color="#5EEAD4", arrow=False)
    for out in outputs:
        d.edge(f"M {out.x} {bus} V {out.top[1] - 7:.1f}", color="#5EEAD4")
    d.edge(f"M {council.x} {below(council)} V {transcript.top[1] - 8:.1f}", color="#F9A8D4")
    iy = i_y + 9
    d.edge(f"M {col[0]} {iy} H {col[6]}", color="#6EE7B7", arrow=False)

    d.packet(f"M {col[0]} 264 V 351 H {col[4]} V {bus} H {col[0]} V 650", "#E9D5FF", 11)
    d.packet(f"M {col[2]} 264 V 351 H {col[4]} V 650", "#99F6E4", 8, 2.5)
    d.packet(f"M {col[6]} 264 V 650", "#FBCFE8", 5, 1)
    d.packet(f"M {col[0]} {iy} H {col[6]}", "#A7F3D0", 9, radius=4, key_points="0;1;0", key_times="0;0.5;1", fade=False)
    return d


def _sequence(
    name: str,
    title: str,
    subtitle: str,
    parts: list[tuple[str, str, str]],
    msgs: list[tuple[int, int, str, bool]],
    *,
    pills: tuple[tuple[str, str], ...] = (),
    frames: tuple[dict, ...] = (),
    aria: str = "",
    glows: tuple[tuple[float, float, float, str, float], ...] = (
        (0.65, 0.25, 0.6, "#7C3AED", 0.16),
        (0.2, 0.8, 0.5, "#0EA5E9", 0.12),
    ),
    x_span: tuple[float, float] = (135, 1150),
) -> Diagram:
    """Animated sequence diagram: messages light up in order, each with a travelling packet.

    ``msgs`` items are ``(from, to, label, is_return)``; ``from == to`` draws a self-call.
    ``frames`` items are ``{"cols": (a, b), "branches": [(msg_index, label), ...], "color": hex}``.
    """
    top, row_h = 268, 33
    d = Diagram(name, 1280, top + len(msgs) * row_h + 70, title, subtitle, pills=pills, glows=glows, aria=aria or title)
    x0, x1 = x_span
    xs = [x0 + i * (x1 - x0) / (len(parts) - 1) for i in range(len(parts))]
    life_end = top + len(msgs) * row_h + 10
    for x, (pname, accent, code) in zip(xs, parts, strict=True):
        d.add(
            "lanes",
            f'<line x1="{x:.1f}" y1="236" x2="{x:.1f}" y2="{life_end}" stroke="{accent}" stroke-opacity="0.35" '
            f'stroke-dasharray="3 6"/>',
        )
        d.block(x, 160, accent, hw=28, bh=16, code=code, title=pname, label_y=222, title_size=13.5)

    def row_y(i: int) -> float:
        return top + (i + 1) * row_h

    for frame in frames:
        a, b = frame["cols"]
        color = frame.get("color", RED)
        branches = frame["branches"]
        last = frame.get("end", branches[-1][0])
        fx0, fx1 = xs[a] - 45, xs[b] + 45
        fy0, fy1 = row_y(branches[0][0]) - row_h + 6, row_y(last) + 9
        d.add(
            "lanes",
            f'<rect x="{fx0:.1f}" y="{fy0:.1f}" width="{fx1 - fx0:.1f}" height="{fy1 - fy0:.1f}" rx="10" fill="{color}" '
            f'fill-opacity="0.05" stroke="{color}" stroke-opacity="0.45" stroke-dasharray="4 4"/>',
        )
        for k, (idx, label) in enumerate(branches):
            sy = row_y(idx) - row_h + 6
            if k:
                d.add(
                    "lanes",
                    f'<line x1="{fx0:.1f}" y1="{sy:.1f}" x2="{fx1:.1f}" y2="{sy:.1f}" stroke="{color}" '
                    f'stroke-opacity="0.35" stroke-dasharray="3 5"/>',
                )
            prefix = "alt " if k == 0 else ""
            d.text(fx0 + 8, sy + 13, f"{prefix}[{label}]", size=10.5, fill=shade(color, 1.3), mono=True, layer="lanes")

    step, move, hold = 0.85, 0.7, 2.5
    total = len(msgs) * step + hold
    for i, (a, b, label, ret) in enumerate(msgs):
        y = row_y(i)
        accent = parts[a][1]
        dash = ' stroke-dasharray="5 5"' if ret else ""
        if a == b:
            x = xs[a]
            path = f"M {x + 5:.1f} {y - 9:.1f} h 34 v 13 h -28"
            label_xy, anchor = (x + 48, y - 1), "start"
        else:
            x1_, x2_ = xs[a], xs[b]
            direction = 1 if x2_ > x1_ else -1
            path = f"M {x1_ + 5 * direction:.1f} {y} H {x2_ - 9 * direction:.1f}"
            label_xy, anchor = ((x1_ + x2_) / 2, y - 7), "middle"
        d.add(
            "edges",
            f'<path d="{path}" fill="none" stroke="{EDGE}" stroke-opacity="0.35" stroke-width="1.6"{dash} '
            f'marker-end="url(#arrow)"/>',
        )
        s, e = (i * step + 0.4) / total, (i * step + 0.4 + move) / total
        reveal = f'values="0;0;1;1;0" keyTimes="0;{s:.4f};{e:.4f};0.985;1" dur="{total:.2f}s" repeatCount="indefinite"'
        d.add(
            "edges",
            f'<path d="{path}" fill="none" stroke="{accent}" stroke-width="2"{dash} opacity="0">'
            f'<animate attributeName="opacity" {reveal}/></path>',
        )
        d.text(*label_xy, label, size=11.5, fill="#CBD5E1", anchor=anchor)
        d.text(48, y + 4, f"{i + 1:02d}", size=11, fill="#475569", mono=True, weight=700, layer="lanes")
        d.add(
            "lanes",
            f'<text x="48" y="{y + 4}" font-family="{MONO}" font-size="11" font-weight="700" fill="{accent}" opacity="0">'
            f'{i + 1:02d}<animate attributeName="opacity" {reveal}/></text>',
        )
        d.add(
            "packets",
            f'<circle r="4.2" fill="{shade(accent, 1.4)}" filter="url(#dotglow)" opacity="0">'
            f'<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;{s:.4f};{s + 0.004:.4f};{e:.4f};'
            f'{e + 0.004:.4f};1" dur="{total:.2f}s" repeatCount="indefinite"/>'
            f'<animateMotion path="{path}" keyPoints="0;0;1;1" keyTimes="0;{s:.4f};{e:.4f};1" calcMode="linear" '
            f'dur="{total:.2f}s" repeatCount="indefinite"/></circle>',
        )
    return d


def sequence() -> Diagram:
    parts = [
        ("Researcher", SOFTBLUE, "USR"),
        ("Editor", BLUE, "UI"),
        ("FastAPI", GREEN, "API"),
        ("Intent Router", AMBER, "IR"),
        ("Ario Agent", VIOLET, "AG"),
        ("Integrity", RED, "L2"),
        ("LLM", PINK, "LLM"),
        ("PostgreSQL", SKY, "PG"),
    ]
    msgs = [
        (0, 1, "Mở project", False),
        (1, 7, "GET / PATCH /papers/{id}  (bearer JWT)", False),
        (1, 2, "syncSession() — best-effort", False),
        (0, 1, "Chat: “rút gọn intro”, “sườn IMRaD”…", False),
        (1, 2, "POST /chat/stream  (SSE, bearer)", False),
        (2, 3, "classify_intent (rules → LLM)", False),
        (3, 1, "event: activity", True),
        (3, 4, "dispatch task", False),
        (4, 6, "prompt + guardrail L1", False),
        (6, 4, "suggestion / edits[]", True),
        (4, 5, "L2 validate — numeric drift, length", False),
        (5, 4, "blocking flag → safe fallback", True),
        (5, 2, "suggestion · diff · edits · flags", True),
        (2, 1, "event: token … event: done", True),
        (1, 0, "Diff đỏ/xanh + Accept / Reject", True),
        (0, 1, "Accept", False),
        (1, 7, "PATCH paper (coalesced saves)", False),
        (1, 2, "POST /compile (delta assets, gzip)", False),
        (2, 1, "PDF base64 + SyncTeX", True),
        (1, 2, "POST /revisions/{session}/{id}  accepted", False),
    ]
    return _sequence(
        "sequence",
        "End-to-end Sequence",
        "Một vòng chỉnh sửa: chat → agent → guardrail → diff → Accept → lưu & compile",
        parts,
        msgs,
        pills=(("SSE", GREEN), ("JWT bearer", BLUE), ("Human Gate", TEAL)),
        frames=({"cols": (2, 5), "branches": [(11, "blocked"), (12, "ok")]},),
        aria="End-to-end sequence between researcher, editor, FastAPI, intent router, agent, integrity monitor, "
        "LLM and PostgreSQL",
    )


def sse_chat() -> Diagram:
    parts = [
        ("Editor", BLUE, "UI"),
        ("chat_stream.py", GREEN, "SSE"),
        ("logic_audit", AMBER, "LA"),
        ("LLM", PINK, "LLM"),
        ("integrity.py", RED, "L2"),
    ]
    msgs = [
        (0, 1, "POST /chat/stream {task, latex}", False),
        (1, 1, "intent / task detect", False),
        (1, 2, "multi-agent debate + synthesize", False),
        (1, 0, "done {logic_audit_report}", True),
        (1, 3, "style + optional reasoning stream", False),
        (1, 4, "L2 integrity + retry", False),
        (1, 0, "done {suggestion, diff, flags}", True),
        (1, 0, "done {apply_mode: document}", True),
        (1, 3, "task handler", False),
        (1, 0, "done", True),
        (0, 0, "Diff Accept / Reject hoặc panel chỉ đọc", False),
    ]
    return _sequence(
        "sse-chat",
        "SSE — Editor Chat",
        "POST /chat/stream rẽ nhánh theo task — chỉ chỉnh sửa văn bản mới qua integrity L2",
        parts,
        msgs,
        pills=(("text/event-stream", GREEN), ("L2 retry", RED)),
        frames=(
            {
                "cols": (0, 4),
                "branches": [(2, "logic"), (4, "style"), (7, "template"), (8, "citation / structure / chat")],
                "end": 9,
                "color": AMBER,
            },
        ),
        aria="SSE editor chat: the stream service branches by task into logic audit, style with integrity check, "
        "template, or other handlers",
    )


def defense_flow() -> Diagram:
    parts = [
        ("Researcher", SOFTBLUE, "USR"),
        ("/defense", PINK, "UI"),
        ("defense_stream.py", GREEN, "SSE"),
        ("LLM persona", VIOLET, "AI"),
    ]
    msgs = [
        (0, 1, "Mở Defense từ project", False),
        (1, 1, "Compile PDF preview", False),
        (0, 1, "Chọn chế độ Proactive hoặc Q&A", False),
        (1, 2, "POST /defense/stream  (Bearer)", False),
        (2, 3, "council prompt + manuscript context", False),
        (3, 2, "streamed tokens", True),
        (2, 1, "SSE token … done", True),
        (1, 1, "Highlight + deep-link trích dẫn trong PDF", False),
    ]
    return _sequence(
        "defense-flow",
        "Defense Mode",
        "Phản biện thử (mock viva) — hội đồng AI đặt câu hỏi dựa trên chính bản thảo",
        parts,
        msgs,
        pills=(("SSE", GREEN), ("quota per tier", PINK)),
        aria="Defense mode sequence between researcher, defense page, defense stream service and LLM persona",
        x_span=(170, 1110),
    )


def langgraph() -> Diagram:
    d = Diagram(
        "langgraph",
        1280,
        690,
        "LangGraph Orchestrator",
        "Sync path POST /chat — parse_node rẽ theo task; chỉnh sửa văn bản (style · edit) đi qua integrity_node",
        pills=(("src/agents/graph.py", VIOLET),),
        glows=((0.55, 0.45, 0.6, "#7C3AED", 0.18),),
    )
    mid = 370
    rows = [170, 250, 330, 410, 490, 570]
    small = {"hw": 26, "bh": 15, "title_size": 13.5}

    def terminal(x, label, accent):
        d.add(
            "blocks",
            f'<circle cx="{x}" cy="{mid + 8}" r="24" fill="#0F172A" stroke="{accent}" stroke-width="2"/>'
            f'<circle class="pulse" cx="{x}" cy="{mid + 8}" r="24" fill="none" stroke="{accent}" stroke-width="2"/>',
        )
        d.text(x, mid + 12.5, label, size=11.5, fill=accent, weight=700, anchor="middle", mono=True)

    terminal(80, "START", GREEN)
    terminal(1200, "END", GREEN)
    route = d.block(215, mid, AMBER, code="IR", title="route_node", sub="intent", **small)
    parse = d.block(360, mid, AMBER, code="TEX", title="parse_node", sub="sections", **small)
    branches = [
        ("style_node", "style", VIOLET, "STY"),
        ("edit_node", "edit", VIOLET, "EDT"),
        ("structure_node", "structure", VIOLET, "STR"),
        ("logic_node", "logic", AMBER, "LOG"),
        ("citation_node", "citation", SKY, "REF"),
        ("chat_node", "chat · template", BLUE, "MSG"),
    ]
    bnodes = [
        d.block(640, y, acc, code=code, title=t, **small) for (t, _l, acc, code), y in zip(branches, rows, strict=True)
    ]
    integrity = d.block(
        850, (rows[0] + rows[1]) / 2, RED, code="L2", title="integrity_node", sub="guardrail L2", **small
    )
    respond = d.block(1050, mid, GREEN, code="OUT", title="respond_node", sub="SSE / JSON", **small)

    d.edge(f"M 106 {mid + 8} H {route.left[0] - 10}")
    d.edge(f"M {route.right[0] + 5} {route.right[1]} H {parse.left[0] - 10}")
    trunk = 470
    d.edge(f"M {parse.right[0] + 5} {parse.right[1]} H {trunk}", arrow=False)
    d.edge(f"M {trunk} {bnodes[0].left[1]} V {bnodes[-1].left[1]}", arrow=False)
    for node, (_t, lbl, _a, _c) in zip(bnodes, branches, strict=True):
        y = node.left[1]
        d.edge(f"M {trunk} {y} H {node.left[0] - 10}", label=lbl, label_at=(trunk + 10, y - 9), label_anchor="start")
    for node in bnodes[:2]:
        d.edge(f"M {node.right[0] + 5} {node.right[1]} H 760 V {integrity.left[1]} H {integrity.left[0] - 10}")
    d.edge(f"M {integrity.right[0] + 5} {integrity.right[1]} H 950 V {respond.left[1] - 6} H {respond.left[0] - 10}")
    for node in bnodes[2:]:
        d.edge(f"M {node.right[0] + 5} {node.right[1]} H 950 V {respond.left[1] + 6} H {respond.left[0] - 10}")
    d.edge(f"M {respond.right[0] + 5} {respond.right[1]} H 1166")
    # error short-circuit: parse -> respond
    d.edge(
        f"M {parse.x - 40} {parse.cy + 70} V 650 H {respond.x} V {respond.cy + 80}",
        dotted=True,
        color="#FCA5A5",
        label="state.error → respond",
        label_at=(700, 642),
    )

    head = f"M 104 {mid + 8} H {trunk}"
    colors = ["#E9D5FF", "#DDD6FE", "#C4B5FD", "#FDE68A", "#BAE6FD", "#BFDBFE"]
    for i, (node, color) in enumerate(zip(bnodes, colors, strict=True)):
        y = node.left[1]
        if i < 2:
            tail = f"V {y} H 760 V {integrity.left[1]} H 950 V {respond.left[1]} H 1176"
        else:
            tail = f"V {y} H 950 V {respond.left[1]} H 1176"
        d.packet(f"{head} {tail}", color, 7.5, i * 1.25)
    return d


def system_overview() -> Diagram:
    d = Diagram(
        "system-overview",
        1280,
        700,
        "System Overview",
        "Từ trình duyệt tới FastAPI, PostgreSQL, 5 nhà cung cấp LLM và 3 nguồn dữ liệu học thuật",
        pills=(("Cloud Run", BLUE), ("REST · SSE · WS", GREEN), ("Bearer JWT", AMBER)),
        glows=((0.5, 0.45, 0.6, "#2563EB", 0.16), (0.85, 0.6, 0.4, "#DB2777", 0.12)),
    )
    d.panel(36, 160, 210, 500, SOFTBLUE, "BROWSER")
    d.panel(266, 160, 230, 500, BLUE, "CLOUD RUN")
    d.panel(516, 160, 230, 500, GREEN, "FASTAPI")
    d.panel(766, 160, 478, 130, SKY, "PERSISTENCE")
    d.panel(766, 306, 478, 170, PINK, "LLM PROVIDERS", "chọn trong editor · failover")
    d.panel(766, 492, 478, 168, VIOLET, "CITATION APIs")
    big = {"hw": 44, "bh": 22, "title_size": 14.5, "sub_size": 11.5}
    researcher = d.block(141, 300, SOFTBLUE, code="USR", title="Researcher", sub="trình duyệt", **big)
    ls = d.block(141, 520, AMBER, code="JWT", title="localStorage", sub="JWT + session", **big)
    fe = d.block(
        381,
        380,
        BLUE,
        code="SSR",
        title="TanStack Start",
        sub="React 19 · Nitro SSR",
        sub2="Marketing · Editor · Defense",
        **big,
    )
    api = d.block(631, 330, GREEN, code="API", title="FastAPI", sub="/api/v1/*", sub2="REST · SSE · WS", **big)
    ing = d.block(631, 545, SOFTBLUE, code="ING", title="Inngest", sub="telemetry · optional", hw=30, bh=17)
    pg = d.block(
        860, 220, SKY, code="PG", title="PostgreSQL", sub="Prisma schema + SQLAlchemy", hw=30, bh=17, label="right"
    )
    llms = [("OAI", "OpenAI"), ("ANT", "Anthropic"), ("OR", "OpenRouter"), ("GLM", "Z.AI GLM"), ("GEM", "Gemini")]
    lx = [840 + i * 90 for i in range(5)]
    for x, (code, title) in zip(lx, llms, strict=True):
        d.block(x, 380, PINK, code=code, title=title, hw=24, bh=14, title_size=12.5)
    sch = [("ARX", "arXiv"), ("DOI", "CrossRef"), ("S2", "Semantic Scholar")]
    sx = [870 + i * 140 for i in range(3)]
    for x, (code, title) in zip(sx, sch, strict=True):
        d.block(x, 565, VIOLET, code=code, title=title, hw=26, bh=15, title_size=12.5)

    (x1, y1), x2 = researcher.right, fe.left[0]
    d.edge(f"M {x1 + 6} {y1} H 250 V {fe.left[1] - 8} H {x2 - 12}", label="HTTPS", label_at=(232, y1 - 12))
    d.edge(
        f"M {fe.left[0] - 6} {fe.left[1] + 10} H 262 V {ls.right[1]} H {ls.right[0] + 12}",
        color="#FCD34D",
        label="Bearer JWT",
        label_at=(226, ls.right[1] - 12),
    )
    d.edge(
        f"M {fe.right[0] + 6} {fe.right[1]} H 520 V {api.left[1]} H {api.left[0] - 12}",
        label="REST · SSE · WS",
        label_at=(476, fe.right[1] - 12),
    )
    d.edge(f"M {api.x} {api.bottom[1] + 66} V {ing.top[1] - 10}", dotted=True, color="#93C5FD")
    trunk = 752
    d.edge(f"M {api.right[0] + 6} {api.right[1]} H {trunk}", arrow=False)
    d.edge(f"M {trunk} {pg.left[1]} V 572.5", arrow=False)
    d.edge(f"M {trunk} {pg.left[1]} H {pg.left[0] - 10}")
    d.edge(f"M {trunk} 387 H {lx[0] - 34}")
    d.edge(f"M {lx[0] + 30} 387 H {lx[-1] - 30}", arrow=False, color="#F9A8D4")
    d.edge(f"M {trunk} 572.5 H {sx[0] - 36}")
    d.edge(f"M {sx[0] + 32} 572.5 H {sx[-1] - 32}", arrow=False, color="#C4B5FD")

    d.packet(f"M {researcher.x} {y1} H 250 V {fe.left[1] - 8} H {fe.x}", "#BFDBFE", 4)
    for i, (path, color) in enumerate(
        [
            (f"M {fe.x} {fe.right[1]} H 520 V {api.left[1]} H {trunk} V {pg.left[1]} H {pg.x}", "#BAE6FD"),
            (f"M {fe.x} {fe.right[1]} H 520 V {api.left[1]} H {trunk} V 387 H {lx[-1]}", "#FBCFE8"),
            (f"M {fe.x} {fe.right[1]} H 520 V {api.left[1]} H {trunk} V 572.5 H {sx[-1]}", "#DDD6FE"),
        ]
    ):
        d.packet(path, color, 6, 1 + i * 2)
    return d


def frontend_routes() -> Diagram:
    d = Diagram(
        "frontend-routes",
        1280,
        640,
        "Frontend Routes & Components",
        "File-based routing (TanStack Start) — editor shell ghép từ các panel độc lập",
        pills=(("TanStack Router", AMBER), ("React 19", BLUE)),
        glows=((0.6, 0.4, 0.6, "#2563EB", 0.15),),
        margin=56,
        header_fade=170,
    )
    col = (310, 445, 580, 725, 870, 1005, 1150)
    d.lane(150, 278, SOFTBLUE, "01", "PUBLIC", "Marketing & đăng nhập")
    d.lane(292, 420, AMBER, "02", "WORKSPACE", "Cần đăng nhập (JWT)")
    d.lane(434, 600, VIOLET, "03", "EDITOR SHELL", "Panel trong /editor, /defense")

    def node(x, cy, accent, code, title, sub, ly):
        return d.block(x, cy, accent, code=code, title=title, sub=sub, label_y=ly)

    node(col[0], 190, SOFTBLUE, "/", "Landing", "marketing · pricing", 248)
    signin = node(col[1], 190, SOFTBLUE, "IN", "/signin · /signup", "email · Google SSO", 248)
    node(col[2], 190, SOFTBLUE, "?", "/guide · /latex-guide", "hướng dẫn", 248)
    tpl = node(col[0], 332, AMBER, "TPL", "/templates", "gallery", 390)
    prj = node(col[1], 332, AMBER, "PRJ", "/projects", "dự án", 390)
    ed = node(col[2], 332, AMBER, "ED", "/editor", "?projectId=", 390)
    node(col[3], 332, AMBER, "ME", "/profile", "researcher profile", 390)
    node(col[4], 332, AMBER, "ADM", "/admin", "god admin", 390)
    dfs = node(col[6], 332, PINK, "DEF", "/defense", "?projectId=", 390)
    shell = [
        node(col[0], 488, VIOLET, "TEX", "LatexEditor", "+ inline diff", 546),
        node(col[1], 488, VIOLET, "PDF", "PdfPreviewPanel", "PDF.js + SyncTeX", 546),
        node(col[2], 488, VIOLET, "AI", "Chat dock", "Ario", 546),
        node(col[3], 488, VIOLET, "KIT", "Tools", "info · citations · logic", 546),
        node(col[4], 488, VIOLET, "%", "Export dialog", "paper score", 546),
        node(col[5], 488, VIOLET, "NEW", "Onboarding", "first-run", 546),
    ]
    dchat = node(col[6], 488, PINK, "QA", "DefenseChatPanel", "+ PdfPreviewPanel", 546)

    d.edge(
        f"M {signin.x} {signin.bottom[1] + 46} V {prj.top[1] - 8}",
        label="JWT",
        label_at=(signin.x + 10, 288),
        label_anchor="start",
    )
    (x1, y), x2 = tpl.right, prj.left[0]
    d.edge(f"M {x1 + 5} {y} H {x2 - 10}", label="open", label_at=((x1 + x2) / 2, y - 10))
    (x1, y), x2 = prj.right, ed.left[0]
    d.edge(f"M {x1 + 5} {y} H {x2 - 10}")
    d.edge(f"M {prj.x} {prj.top[1] - 6} V 302 H {dfs.x} V {dfs.top[1] - 8}")
    bus = 428
    d.edge(f"M {ed.x} 416 V {bus}", arrow=False, color="#C4B5FD")
    d.edge(f"M {col[0]} {bus} H {col[5]}", arrow=False, color="#C4B5FD")
    for s in shell:
        d.edge(f"M {s.x} {bus} V {s.top[1] - 7}", color="#C4B5FD")
    d.edge(f"M {dfs.x} {dfs.bottom[1] + 46} V {dchat.top[1] - 8}", color="#F9A8D4")
    d.packet(f"M {col[0]} {tpl.right[1]} H {col[2]} V {bus} H {col[5]} V {shell[0].cy}", "#DDD6FE", 8)
    d.packet(f"M {prj.x} {prj.top[1]} V 302 H {dfs.x} V {dchat.cy}", "#FBCFE8", 6, 2)
    return d


def api_surface() -> Diagram:
    d = Diagram(
        "api-surface",
        1280,
        640,
        "Backend API Surface",
        "Mọi route nằm dưới /api/v1 — router mỏng, logic nằm trong services/",
        pills=(("FastAPI", GREEN), ("OpenAPI /docs", SKY)),
        glows=((0.5, 0.5, 0.6, "#059669", 0.14),),
        margin=56,
        header_fade=170,
    )
    xs = [290 + i * 125.7 for i in range(8)]
    d.lane(150, 278, BLUE, "01", "CLIENT", "Frontend · Bearer JWT")
    d.lane(292, 440, GREEN, "02", "API /api/v1", "src/api/*")
    d.lane(454, 600, VIOLET, "03", "SERVICES & DATA", "src/services · PostgreSQL")
    fe = d.block(xs[0], 190, BLUE, code="UI", title="Frontend", sub="TanStack Start", label="right")
    groups = [
        ("AUTH", "/auth/*", "JWT · Google SSO"),
        ("DOC", "/papers/*", "CRUD projects"),
        ("AI", "/chat · /compile", "/citations · /stream"),
        ("ME", "/users/me", "profile"),
        ("LNK", "/papers/{id}/share", "read-only link"),
        ("QA", "/defense/*", "stream · quota"),
        ("TPL", "/templates/*", "gallery · admin"),
        ("ADM", "/admin/*", "users · LLM keys"),
    ]
    api = [
        d.block(x, 340, GREEN, code=c, title=t, sub=s, label_y=400, title_size=13, sub_size=11)
        for x, (c, t, s) in zip(xs, groups, strict=True)
    ]
    db = d.block((xs[0] + xs[1]) / 2, 500, SKY, code="PG", title="PostgreSQL", sub="papers · users", label_y=560)
    stream = d.block(xs[2] - 55, 500, VIOLET, code="SSE", title="chat_stream.py", sub="editor SSE", label_y=560)
    lg = d.block(xs[2] + 70, 500, VIOLET, code="LG", title="LangGraph", sub="+ logic_audit", label_y=560)
    dstream = d.block(
        xs[5], 500, PINK, code="QA", title="defense_stream.py", sub="mock viva", label_y=560, title_size=12.5
    )
    tstore = d.block(
        xs[6], 500, AMBER, code="TPL", title="template_store.py", sub="seed + CRUD", label_y=560, title_size=12.5
    )

    bus = 284
    d.edge(f"M {fe.x} {fe.bottom[1] + 4} V {bus}", arrow=False)
    d.edge(f"M {xs[0]} {bus} H {xs[-1]}", arrow=False)
    for a in api:
        d.edge(f"M {a.x} {bus} V {a.top[1] - 7}")
    low = 446

    def down(src: Box, dst: Box, color=EDGE):
        d.edge(f"M {src.x} 420 V {low} H {dst.x} V {dst.top[1] - 7}", color=color)

    down(api[0], db, "#7DD3FC")
    down(api[1], db, "#7DD3FC")
    down(api[2], stream, "#C4B5FD")
    down(api[2], lg, "#C4B5FD")
    down(api[5], dstream, "#F9A8D4")
    down(api[6], tstore, "#FCD34D")
    d.packet(f"M {fe.x} {fe.bottom[1]} V {bus} H {xs[2]} V 420 V {low} H {lg.x} V {lg.cy}", "#BBF7D0", 6)
    d.packet(f"M {fe.x} {fe.bottom[1]} V {bus} H {xs[1]} V 420 V {low} H {db.x} V {db.cy}", "#BAE6FD", 6, 2)
    d.packet(f"M {fe.x} {fe.bottom[1]} V {bus} H {xs[5]} V 420 V {low} V {dstream.cy}", "#FBCFE8", 6, 4)
    return d


def export_gate() -> Diagram:
    d = Diagram(
        "export-gate",
        1280,
        520,
        "Publication Score & Export Gate",
        "Trước khi xuất PDF: nếu bản thảo đã đổi, chạy quick logic skim rồi chấm điểm",
        pills=(("paper_gate_skim", AMBER), ("computePaperScore", SKY)),
        glows=((0.55, 0.5, 0.6, "#0EA5E9", 0.15),),
    )
    big = {"hw": 40, "bh": 20, "title_size": 14.5, "sub_size": 11.5}
    exp = d.block(150, 330, BLUE, code="PDF", title="Export", sub="người dùng bấm xuất", **big)
    gate = d.block(390, 330, AMBER, code="?", title="Bản thảo đã đổi?", sub="so fingerprint", pulse=True, **big)
    skim = d.block(630, 220, RED, code="L", title="Quick logic skim", sub="paper_gate_skim", **big)
    score = d.block(870, 330, SKY, code="%", title="computePaperScore", sub="dimensions + tổng điểm", **big)
    dialog = d.block(1110, 330, GREEN, code="DL", title="Score dialog", sub="ring · dimensions · tải PDF", **big)
    (x1, y), x2 = exp.right, gate.left[0]
    d.edge(f"M {x1 + 6} {y} H {x2 - 12}")
    gx, gy = gate.right
    d.edge(f"M {gx + 6} {gy} H {score.left[0] - 12}", label="không", label_at=(560, gy - 12), color="#7DD3FC")
    d.edge(
        f"M {gate.x} {gate.top[1] - 6} V {skim.left[1]} H {skim.left[0] - 12}",
        label="có",
        label_at=(gate.x + 12, skim.left[1] - 12),
        label_anchor="start",
        color="#FCA5A5",
    )
    d.edge(f"M {skim.right[0] + 6} {skim.right[1]} H {score.x} V {score.top[1] - 8}", color="#FCA5A5")
    (x1, y), x2 = score.right, dialog.left[0]
    d.edge(f"M {x1 + 6} {y} H {x2 - 12}")
    d.packet(f"M {exp.x} {y} H {gate.x} V {skim.left[1]} H {score.x} V {score.cy} V {y} H {dialog.x}", "#FECACA", 7)
    d.packet(f"M {exp.x} {y} H {dialog.x}", "#BAE6FD", 5, 3.5)
    return d


def template_gallery() -> Diagram:
    d = Diagram(
        "template-gallery",
        1280,
        560,
        "Template Gallery",
        "Chọn template (IEEE, …) → tạo paper mới trong PostgreSQL → mở thẳng vào editor",
        pills=(("GET /templates", GREEN), ("POST /templates/{id}/open", AMBER)),
        glows=((0.45, 0.5, 0.6, "#D97706", 0.13),),
    )
    big = {"hw": 42, "bh": 20, "title_size": 14.5, "sub_size": 11.5}
    gal = d.block(150, 330, AMBER, code="TPL", title="/templates", sub="gallery", **big)
    lst = d.block(450, 220, GREEN, code="GET", title="GET /templates", sub="danh sách + preview", **big)
    store = d.block(760, 220, VIOLET, code="DB", title="template_store.py", sub="seed + admin CRUD", **big)
    opn = d.block(450, 420, GREEN, code="NEW", title="POST /templates/{id}/open", sub="Open as Template", **big)
    paper = d.block(760, 420, SKY, code="PG", title="Paper mới", sub="PostgreSQL", **big)
    ed = d.block(1070, 420, BLUE, code="ED", title="/editor", sub="?projectId=", **big)
    gx, gy = gal.right
    d.edge(f"M {gx + 6} {gy - 6} H 300 V {lst.left[1]} H {lst.left[0] - 12}")
    d.edge(f"M {lst.right[0] + 6} {lst.right[1]} H {store.left[0] - 12}")
    d.edge(
        f"M {gx + 6} {gy + 8} H 300 V {opn.left[1]} H {opn.left[0] - 12}",
        label="open",
        label_at=(310, opn.left[1] - 12),
        label_anchor="start",
    )
    d.edge(f"M {opn.right[0] + 6} {opn.right[1]} H {paper.left[0] - 12}")
    d.edge(f"M {paper.right[0] + 6} {paper.right[1]} H {ed.left[0] - 12}")
    d.packet(f"M {gal.x} {gy - 6} H 300 V {lst.left[1]} H {store.x}", "#BBF7D0", 5)
    d.packet(f"M {gal.x} {gy + 8} H 300 V {opn.left[1]} H {ed.x}", "#FDE68A", 6, 2.5)
    return d


def auth_session() -> Diagram:
    d = Diagram(
        "auth-session",
        1280,
        480,
        "Auth & Session",
        "JWT do FastAPI ký, lưu ở localStorage và gửi kèm Bearer cho mọi request cần đăng nhập",
        pills=(("JWT 72h · remember 30d", AMBER), ("Google SSO", BLUE)),
        glows=((0.5, 0.5, 0.6, "#CA8A04", 0.13),),
    )
    big = {"hw": 40, "bh": 20, "title_size": 14.5, "sub_size": 11.5}
    nodes = [
        d.block(140, 300, SOFTBLUE, code="IN", title="Sign in", sub="email · Google SSO", **big),
        d.block(380, 300, GREEN, code="API", title="/auth/*", sub="verify · issue token", **big),
        d.block(620, 300, AMBER, code="JWT", title="Access token", sub="72h · remember 30d", **big),
        d.block(860, 300, AMBER, code="LS", title="localStorage", sub="chia sẻ giữa các tab", **big),
        d.block(1100, 300, GREEN, code="API", title="/api/v1/*", sub="Authorization: Bearer", **big),
    ]
    labels = ["credentials", "sign", "persist", "Bearer"]
    for a, b, lbl in zip(nodes, nodes[1:], labels, strict=False):
        (x1, y), x2 = a.right, b.left[0]
        d.edge(f"M {x1 + 6} {y} H {x2 - 12}", label=lbl, label_at=((x1 + x2) / 2, y - 12))
    d.edge(
        f"M {nodes[4].x} {nodes[4].top[1] - 6} V 200 H {nodes[3].x} V {nodes[3].top[1] - 8}",
        dotted=True,
        color="#FCA5A5",
        label="401 → xoá session, đăng nhập lại",
        label_at=((nodes[3].x + nodes[4].x) / 2, 190),
    )
    d.packet(f"M {nodes[0].x} {nodes[0].right[1]} H {nodes[4].x}", "#FDE68A", 6)
    return d


def citation_verifier() -> Diagram:
    d = Diagram(
        "citation-verifier",
        1280,
        660,
        "Citation Verifier",
        "Mỗi cite key đi qua 3 lớp tra cứu — không có kết quả thì trả về not_found, không bao giờ bịa",
        pills=(("arXiv → CrossRef → S2", VIOLET), ("no fabrication", RED)),
        glows=((0.5, 0.45, 0.6, "#7C3AED", 0.16),),
    )
    dec = {"hw": 34, "bh": 18, "title_size": 13.5, "sub_size": 11.5}
    src = d.block(130, 260, BLUE, code="BIB", title="BibTeX + cite keys", sub="từ bản thảo", **dec)
    d1 = d.block(360, 260, AMBER, code="?", title="Có arXiv id?", **dec)
    d2 = d.block(590, 260, AMBER, code="?", title="Có DOI?", **dec)
    d3 = d.block(820, 260, AMBER, code="?", title="Có title?", **dec)
    nf = d.block(1080, 260, RED, code="∅", title="not_found", sub="ghi nhận trung thực", **dec)
    arx = d.block(360, 450, VIOLET, code="ARX", title="arXiv API", **dec)
    cr = d.block(590, 450, VIOLET, code="DOI", title="CrossRef", **dec)
    ss = d.block(820, 450, VIOLET, code="S2", title="Semantic Scholar", **dec)
    out = d.block(1080, 450, GREEN, code="OK", title="Kết quả", sub="verified · mismatch", label="left", **dec)
    llm = d.block(
        1180, 600, MUTED, code="L4", title="LLM relevance", sub="(planned)", label="left", hw=26, bh=14, float_=False
    )

    (x1, y), x2 = src.right, d1.left[0]
    d.edge(f"M {x1 + 6} {y} H {x2 - 12}")
    for a, b in [(d1, d2), (d2, d3), (d3, nf)]:
        (x1, y), x2 = a.right, b.left[0]
        d.edge(f"M {x1 + 6} {y} H {x2 - 12}", label="không", label_at=((x1 + x2) / 2, y - 12), color="#FCA5A5")
    for a, b in [(d1, arx), (d2, cr), (d3, ss)]:
        d.edge(
            f"M {a.x} {a.bottom[1] + 34} V {b.top[1] - 8}",
            label="có",
            label_at=(a.x + 10, (a.bottom[1] + b.top[1]) / 2 + 18),
            label_anchor="start",
            color="#86EFAC",
        )
    bus = 548
    for a in (arx, cr, ss):
        d.edge(f"M {a.x} {a.bottom[1] + 30} V {bus}", arrow=False, color="#C4B5FD")
    d.edge(f"M {arx.x} {bus} H {out.x} V {out.bottom[1] + 8}", color="#C4B5FD")
    d.edge(f"M {nf.x} {nf.bottom[1] + 46} V {out.top[1] - 8}", color="#FCA5A5")
    d.edge(f"M {out.right[0] + 6} {out.right[1]} H {llm.x} V {llm.top[1] - 8}", dotted=True, color=MUTED)
    y0 = src.right[1]
    paths = [
        (f"M {src.x} {y0} H {d1.x} V {arx.cy} V {bus} H {out.x} V {out.cy}", "#DDD6FE"),
        (f"M {src.x} {y0} H {d2.x} V {cr.cy} V {bus} H {out.x} V {out.cy}", "#C4B5FD"),
        (f"M {src.x} {y0} H {d3.x} V {ss.cy} V {bus} H {out.x} V {out.cy}", "#A78BFA"),
        (f"M {src.x} {y0} H {nf.x} V {out.cy}", "#FCA5A5"),
    ]
    for i, (path, color) in enumerate(paths):
        d.packet(path, color, 7, i * 1.75)
    return d


def persistence() -> Diagram:
    d = Diagram(
        "persistence",
        1280,
        500,
        "Paper & Session Persistence",
        "Ba lớp lưu trữ có chủ đích — UI phản hồi tức thì, PostgreSQL là nguồn sự thật",
        pills=(("coalesced saves", BLUE), ("best-effort sync", VIOLET)),
        glows=((0.5, 0.5, 0.6, "#0EA5E9", 0.14),),
    )
    big = {"hw": 62, "bh": 28, "title_size": 16, "sub_size": 12.5}
    fe = d.block(250, 275, BLUE, code="LS", title="Frontend cache", sub="localStorage · project-store", **big)
    db = d.block(1010, 205, SKY, code="PG", title="PostgreSQL", sub="papers · users · audit", **big)
    ss = d.block(640, 330, VIOLET, code="MEM", title="Session store", sub="in-memory · citations · revisions", **big)
    (x1, y1), (x2, y2) = fe.right, db.left
    d.edge(f"M {x1 + 6} {y1 - 6} H 560 V {y2} H {x2 - 12}", label="PATCH — coalesced", label_at=(700, y2 - 12))
    d.edge(
        f"M {x1 + 6} {y1 + 8} H 470 V {ss.left[1]} H {ss.left[0] - 12}",
        label="best-effort",
        label_at=(520, ss.left[1] - 12),
    )
    d.edge(
        f"M {ss.right[0] + 6} {ss.right[1]} H 1160 V {db.right[1]} H {db.right[0] + 12}",
        dotted=True,
        color="#C4B5FD",
        label="khi DB sẵn sàng",
        label_at=(1150, ss.right[1] + 20),
        label_anchor="end",
    )
    d.packet(f"M {x1} {y1 - 6} H 560 V {y2} H {db.x}", "#BFDBFE", 4.5)
    d.packet(f"M {x1} {y1 + 8} H 470 V {ss.left[1]} H {ss.x}", "#DDD6FE", 4.5, 1.6)
    d.packet(f"M {ss.x} {ss.right[1]} H 1160 V {db.right[1]} H {db.x}", "#C4B5FD", 6, 3)
    return d


def guardrails() -> Diagram:
    d = Diagram(
        "guardrails",
        1280,
        780,
        "Guardrail Architecture",
        "4 lớp phòng vệ — một vi phạm ở lớp 2 sẽ bị chặn trước khi tới tay tác giả",
        pills=(("blocking flags", RED), ("audit trail", AMBER)),
        glows=((0.6, 0.45, 0.6, "#DC2626", 0.12), (0.25, 0.3, 0.5, "#7C3AED", 0.14)),
    )
    lanes = [
        (150, 290, VIOLET, "L1", "PROMPT", "Ràng buộc trước khi gọi LLM"),
        (304, 444, RED, "L2", "OUTPUT CHECK", "Kiểm tra output của LLM"),
        (458, 598, TEAL, "L3", "DIFF DISPLAY", "Không ghi đè âm thầm"),
        (612, 752, AMBER, "L4", "AUDIT LOG", "Lưu vết mọi quyết định"),
    ]
    for lane in lanes:
        d.lane(*lane)
    spine = 300
    items = [
        [("SYS", "System prompt rules", "prompts.default.yaml"), ("INJ", "Injection guard", "request_guard.py")],
        [
            ("NUM", "Numeric drift", "metric changes"),
            ("LEN", "Length / semantic", "rewrite bounds"),
            ("SCP", "Editor scope", "off-topic guard"),
            ("SAN", "Output sanitize", "strip unsafe"),
        ],
        [("DIF", "Line diff", "no silent overwrite"), ("BLK", "Blocking flags", "disable Accept")],
        [
            ("REV", "Revision history", "AuditLog DB"),
            ("ACK", "Accept → API", "revision record"),
            ("FPR", "Score fingerprint", "publication gate"),
        ],
    ]
    xs = [440, 640, 840, 1040]
    for (top, bottom, accent, *_r), row in zip(lanes, items, strict=True):
        cy = top + 46
        d.edge(f"M {spine} {cy + 9} H {xs[len(row) - 1]}", color=shade(accent, 1.2), arrow=False)
        for x, (code, title, sub) in zip(xs[: len(row)], row, strict=True):
            d.block(x, cy, accent, code=code, title=title, sub=sub, label_y=cy + 62)
    for (_t, b0, *_), (t1, *_r) in zip(lanes, lanes[1:]):
        d.edge(f"M {spine} {b0 - 30} V {t1 + 30}")
    d.add("edges", f'<path d="M {spine} 186 V 721" fill="none" stroke="{EDGE_BASE}" stroke-width="2"/>')
    d.text(spine, 172, "LLM request", size=11.5, fill=MUTED, anchor="middle", mono=True, layer="edges")
    # a clean packet passes every layer; a second one is blocked at L2
    d.packet(f"M {spine} 186 V 721", "#E9D5FF", 7)
    d.add(
        "packets",
        f'<circle r="4.5" fill="#FCA5A5" filter="url(#dotglow)" opacity="0">'
        f'<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.4;0.43;1" dur="7s" begin="3.5s" '
        f'repeatCount="indefinite"/><animateMotion path="M {spine} 186 V 359" keyPoints="0;1;1" keyTimes="0;0.4;1" '
        f'calcMode="linear" dur="7s" begin="3.5s" repeatCount="indefinite"/></circle>',
    )
    blk = (spine, 359)
    total = 7
    d.add(
        "packets",
        f'<g opacity="0" transform="translate({blk[0]} {blk[1]})"><circle r="15" fill="#7F1D1D" stroke="{RED}" stroke-width="2"/>'
        f'<path d="M -6 -6 L 6 6 M 6 -6 L -6 6" stroke="#FECACA" stroke-width="2.6" stroke-linecap="round"/>'
        f'<text x="-26" y="5" text-anchor="end" font-family="{MONO}" font-size="11.5" fill="#FCA5A5">blocked</text>'
        f'<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.4;0.43;0.75;0.8" dur="{total}s" begin="3.5s" '
        f'repeatCount="indefinite"/></g>',
    )
    return d


def deployment() -> Diagram:
    d = Diagram(
        "deployment",
        1280,
        620,
        "Deployment",
        "Hai service trên Google Cloud Run (asia-east1) — custom domain, secrets qua Secret Manager",
        pills=(("Cloud Run", BLUE), ("Docker", SKY), ("HTTPS", GREEN)),
        glows=((0.45, 0.5, 0.6, "#2563EB", 0.16), (0.85, 0.4, 0.4, "#DB2777", 0.12)),
    )
    d.panel(36, 170, 200, 400, SOFTBLUE, "CLIENT")
    d.panel(262, 170, 520, 400, BLUE, "GOOGLE CLOUD RUN", "asia-east1")
    d.panel(808, 170, 436, 120, SKY, "DATA")
    d.panel(808, 310, 436, 260, PINK, "EXTERNAL")
    big = {"hw": 50, "bh": 24, "title_size": 15, "sub_size": 12}
    browser = d.block(136, 370, SOFTBLUE, code="WEB", title="Browser", sub="researcher", **big)
    fe = d.block(400, 370, BLUE, code="SSR", title="arionear-web", sub="TanStack Start · Nitro SSR", **big)
    be = d.block(640, 370, GREEN, code="API", title="arionear-api", sub="FastAPI + TeX Live", **big)
    small = {"hw": 30, "bh": 17, "label": "right", "title_size": 13.5, "sub_size": 11.5}
    db = d.block(880, 220, SKY, code="PG", title="PostgreSQL", sub="Prisma Accelerate", **small)
    llm = d.block(880, 370, PINK, code="LLM", title="LLM Providers", sub="Z.AI · Google · OpenRouter · …", **small)
    sch = d.block(880, 445, PINK, code="S2", title="Scholarly APIs", sub="arXiv · CrossRef · Semantic Scholar", **small)
    smtp = d.block(880, 520, PINK, code="@", title="SMTP · Google OAuth", sub="email verify · SSO", **small)
    (x1, y1), x2 = browser.right, fe.left[0]
    d.edge(f"M {x1 + 6} {y1} H {x2 - 12}", label="HTTPS", label_at=((x1 + x2) / 2, y1 - 12))
    (x1, y1), x2 = fe.right, be.left[0]
    d.edge(f"M {x1 + 6} {y1} H {x2 - 12}", label="REST · SSE · WS", label_at=((x1 + x2) / 2, y1 - 12))
    trunk = 760
    bx, by = be.right
    d.edge(f"M {bx + 6} {by} H {trunk}", arrow=False)
    d.edge(f"M {trunk} {db.left[1]} V {smtp.left[1]}", arrow=False)
    for target in (db, llm, sch, smtp):
        d.edge(f"M {trunk} {target.left[1]} H {target.left[0] - 10}")
    d.packet(f"M {browser.x} {browser.right[1]} H {be.x}", "#BFDBFE", 4.5)
    for i, target in enumerate((db, llm, sch, smtp)):
        d.packet(f"M {be.x} {by} H {trunk} V {target.left[1]} H {target.x}", "#FBCFE8", 4, 1.2 + i * 0.9)
    return d


DIAGRAMS = {
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
        print(f"wrote {path.relative_to(OUT_DIR.parents[1])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
