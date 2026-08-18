"""Build the Elbakri Overseas lockup as pure SVG paths.

The wordmark is outlined rather than set as <text>: these files are loaded with
<img src="...">, and an SVG referenced that way renders in an isolated document
that never sees the page's web fonts — so `font-family:Inter` silently fell back
to whatever the device happened to have, and the logo drew differently on every
machine. Outlines render identically everywhere.
"""
import re

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

FONT = 'public/assets/fonts/Tajawal-Bold.ttf'
UPM = 1000
CAP = 633  # cap height in font units


NUM = re.compile(r"-?\d+\.\d+")


def _round(d, places=2):
    """Trim path coordinates. The pen emits full float precision, which tripled
    the file size for detail below what any screen can resolve."""
    return NUM.sub(lambda m: f"{float(m.group()):.{places}f}".rstrip("0").rstrip("."), d)


def word_path(text, cap_px, tracking_px, x0, baseline_y):
    """Outline `text` at a given cap height, returning (path_d, advance_width)."""
    font = TTFont(FONT)
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    hmtx = font['hmtx']

    scale = cap_px / CAP                      # font units -> px
    pen_x = 0.0
    parts = []

    for ch in text:
        gname = cmap.get(ord(ch))
        if gname is None:
            continue
        pen = SVGPathPen(gs)
        # y is flipped: font space is y-up, SVG is y-down.
        tp = TransformPen(pen, Transform(scale, 0, 0, -scale, x0 + pen_x, baseline_y))
        gs[gname].draw(tp)
        d = _round(pen.getCommands())
        if d:
            parts.append(d)
        pen_x += hmtx[gname][0] * scale + tracking_px

    width = pen_x - tracking_px if text else 0
    return ' '.join(parts), width


def build(ink, muted, out):
    # ── Mark ──────────────────────────────────────────────────────────────
    # A solid "B" built from a flat left stem and two lobes, with a wing
    # knocked out of the upper lobe — the reference mark, not a generic tile.
    # ── Mark ──────────────────────────────────────────────────────────────
    # A solid "B": a flat left stem and two lobes, with the upper counter
    # replaced by a wing. The wing is a subpath of the same shape under
    # fill-rule="evenodd", so it is a real hole — it reads correctly on a light
    # page and on the navy sidebar without a second coloured shape to keep in
    # sync.
    mark = f'''  <g id="mark">
    <path fill="{ink}" fill-rule="evenodd" d="
      M12 8
      H58
      C80 8 96 22 96 42
      C96 53 91 61.5 82.5 66.5
      C93 71 100 81 100 94
      C100 113 84 126 60 126
      H12 Z
      M88 26 L38 60 L56 65 L50 82 L62 67 Z" />
  </g>'''

    # ── Wordmark ──────────────────────────────────────────────────────────
    top_d, top_w = word_path('ELBAKRI', cap_px=44, tracking_px=5.5, x0=124, baseline_y=64)
    bot_d, bot_w = word_path('OVERSEAS', cap_px=44, tracking_px=0, x0=124, baseline_y=118)
    # "OVERSEAS" is the longer word; track "ELBAKRI" out to the same measure so
    # the two lines lock up as a block, the way the original does.
    extra = (bot_w - top_w) / (len('ELBAKRI') - 1)
    top_d, top_w = word_path('ELBAKRI', cap_px=44, tracking_px=5.5 + extra, x0=124, baseline_y=64)

    est_d, est_w = word_path('EST. 1982', cap_px=14, tracking_px=1.2,
                             x0=124 + top_w + 12, baseline_y=64)

    total_w = 124 + max(top_w + 12 + est_w, bot_w) + 8
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w:.0f} 130" role="img" aria-label="Elbakri Overseas">
  <title>Elbakri Overseas</title>
{mark}
  <g id="wordmark" fill="{ink}">
    <path d="{top_d}"/>
    <path d="{bot_d}"/>
  </g>
  <path id="est" fill="{muted}" d="{est_d}"/>
</svg>
'''
    open(out, 'w').write(svg)
    print(f'{out}: viewBox width {total_w:.0f}, ELBAKRI {top_w:.1f}px, OVERSEAS {bot_w:.1f}px')


build('#0F1B47', '#8A97B5', '/tmp/logo-navy.svg')
build('#FFFFFF', 'rgba(255,255,255,0.62)', '/tmp/logo-white.svg')
