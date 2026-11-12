"""Draws the app's art for the release kit: the icon and the listing banner.

The icon: a config sheet with three sliders (guided edits) and a green
shield with a tick (the safety check), on the teal rounded square.

Run (needs Pillow; the banner needs a bold font, DejaVu Sans Bold by
default, or point CC_FONT_BOLD and CC_FONT at other .ttf files):
    python3 tools/art/make_art.py tools/art
It writes app-icon.png (1024), icon-400.png and banner.png (1600x500) there.
Then `npx tauri icon tools/art/app-icon.png -o <folder>` makes every icon
size; copy the five src-tauri/icons/ uses (32x32.png, 128x128.png,
128x128@2x.png, icon.ico, icon.png) over the old ones.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

S = 4  # drawn at 4x and scaled down, for smooth edges
TEAL_TOP, TEAL_BOTTOM = (31, 160, 176), (12, 104, 118)
TEAL_DARK = (10, 92, 105)
TRACK = (196, 226, 230)
GREEN, GREEN_DARK = (46, 184, 114), (30, 140, 86)
WHITE = (255, 255, 255)


def gradient(size, top, bottom):
    img = Image.new("RGBA", size)
    d = ImageDraw.Draw(img)
    for y in range(size[1]):
        f = y / max(1, size[1] - 1)
        d.line([(0, y), (size[0], y)], fill=tuple(round(a + (b - a) * f) for a, b in zip(top, bottom)) + (255,))
    return img


def shield(cx, cy, w, h):
    """A shield outline: flat top with rounded shoulders, sides curving to a point."""
    pts = []
    top = cy - h / 2
    for i in range(0, 41):
        t = i / 40
        # right side, from the top corner down to the point
        x = cx + w / 2 * (1 - t**2.2)
        y = top + h * 0.18 + (h * 0.82) * t
        pts.append((x, y))
    for i in range(40, -1, -1):
        t = i / 40
        x = cx - w / 2 * (1 - t**2.2)
        y = top + h * 0.18 + (h * 0.82) * t
        pts.append((x, y))
    # the top edge dips a little in the middle, like a crest
    for i in range(0, 21):
        t = i / 20
        x = cx - w / 2 + w * t
        y = top + h * 0.18 - h * 0.12 * math.sin(math.pi * t) * 0.6 - h * 0.06
        pts.append((x, y))
    return pts


def icon(n=1024):
    N = n * S
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    pad, radius = 64 * S, 220 * S
    mask = Image.new("L", (N, N), 0)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, N - pad, N - pad], radius=radius, fill=255)
    img.paste(gradient((N, N), TEAL_TOP, TEAL_BOTTOM), (0, 0), mask)
    d = ImageDraw.Draw(img)

    # The config sheet, with its top-right corner folded.
    x0, y0, x1, y1, fold = 236 * S, 196 * S, 716 * S, 812 * S, 120 * S
    # Drawn on its own layer, so cutting the corner leaves the gradient behind it.
    corner = [(x1 - fold, y0 - 4 * S), (x1 + 4 * S, y0 - 4 * S), (x1 + 4 * S, y0 + fold)]
    shadow = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([x0 + 18 * S, y0 + 22 * S, x1 + 18 * S, y1 + 22 * S], radius=36 * S, fill=(0, 40, 48, 70))
    sd.polygon([(x + 18 * S, y + 22 * S) for x, y in corner], fill=(0, 0, 0, 0))
    img.alpha_composite(shadow)
    sheet = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    sh = ImageDraw.Draw(sheet)
    sh.rounded_rectangle([x0, y0, x1, y1], radius=36 * S, fill=WHITE + (255,))
    sh.polygon(corner, fill=(0, 0, 0, 0))
    sh.polygon([(x1 - fold, y0), (x1 - fold, y0 + fold), (x1, y0 + fold)], fill=TRACK + (255,))
    img.alpha_composite(sheet)
    d = ImageDraw.Draw(img)

    # Three sliders on the sheet.
    left, right, thick, knob = 300 * S, 650 * S, 30 * S, 46 * S
    for y, x in ((400, 560), (530, 380), (660, 500)):
        y, x = y * S, x * S
        d.rounded_rectangle([left, y - thick // 2, right, y + thick // 2], radius=thick // 2, fill=TRACK + (255,))
        d.rounded_rectangle([left, y - thick // 2, x, y + thick // 2], radius=thick // 2, fill=TEAL_TOP + (255,))
        d.ellipse([x - knob, y - knob, x + knob, y + knob], fill=TEAL_DARK + (255,))
        d.ellipse([x - knob + 14 * S, y - knob + 14 * S, x + knob - 14 * S, y + knob - 14 * S], fill=WHITE + (255,))

    # The safety shield, bottom right, with a white rim and a tick.
    cx, cy, w, h = 720 * S, 720 * S, 300 * S, 340 * S
    d.polygon(shield(cx, cy, w + 44 * S, h + 44 * S), fill=WHITE + (255,))
    d.polygon(shield(cx, cy, w, h), fill=GREEN + (255,))
    d.polygon(shield(cx + 4 * S, cy + 10 * S, w * 0.5, h * 0.86)[:41] + [(cx + 4 * S, cy + h * 0.45)], fill=GREEN_DARK + (90,))
    tick = [(cx - 78 * S, cy + 4 * S), (cx - 22 * S, cy + 62 * S), (cx + 86 * S, cy - 60 * S)]
    d.line(tick, fill=WHITE + (255,), width=40 * S, joint="curve")
    for px, py in (tick[0], tick[-1]):
        d.ellipse([px - 20 * S, py - 20 * S, px + 20 * S, py + 20 * S], fill=WHITE + (255,))
    return img.resize((n, n), Image.LANCZOS)


def font(env, fallback_names, size):
    path = os.environ.get(env)
    candidates = [path] if path else []
    for base in ("/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts"), "C:/Windows/Fonts"):
        for name in fallback_names:
            candidates.append(os.path.join(base, name))
    # A DejaVu that ships with matplotlib, if nothing else is around.
    for root, _dirs, files in os.walk(os.path.expanduser("~")):
        if "mpl-data" in root:
            candidates += [os.path.join(root, f) for f in files if f in fallback_names]
        if len(candidates) > 40:
            break
    for c in candidates:
        if c and os.path.isfile(c):
            return ImageFont.truetype(c, size)
    raise SystemExit(f"no font found: set {env} to a .ttf file")


def banner(app_icon):
    W, H = 1600, 500
    img = gradient((W, H), (14, 58, 66), (8, 34, 40))
    d = ImageDraw.Draw(img)
    # Faint slider tracks across the back, echoing the icon.
    for i, (y, x) in enumerate(((120, 1180), (250, 980), (380, 1300))):
        d.rounded_rectangle([760, y - 6, 1560, y + 6], radius=6, fill=(255, 255, 255, 22))
        d.rounded_rectangle([760, y - 6, x, y + 6], radius=6, fill=TEAL_TOP + (70,))
        d.ellipse([x - 16, y - 16, x + 16, y + 16], fill=(255, 255, 255, 60))
    img.alpha_composite(app_icon.resize((360, 360), Image.LANCZOS), (70, 70))
    bold = font("CC_FONT_BOLD", ["DejaVuSans-Bold.ttf", "Inter-Bold.ttf", "segoeuib.ttf"], 84)
    regular = font("CC_FONT", ["DejaVuSans.ttf", "Inter-Regular.ttf", "segoeui.ttf"], 36)
    d.text((480, 150), "Clash Configurator", font=bold, fill=WHITE)
    d.text((484, 268), "Config in, safety check, guided edits, config out.", font=regular, fill=(200, 232, 236))
    d.text((484, 324), "Free, open source, and everything stays on your PC.", font=regular, fill=(150, 200, 208))
    return img


def main(out):
    os.makedirs(out, exist_ok=True)
    big = icon(1024)
    big.save(os.path.join(out, "app-icon.png"))
    big.resize((400, 400), Image.LANCZOS).save(os.path.join(out, "icon-400.png"))
    banner(big).convert("RGB").save(os.path.join(out, "banner.png"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__)))
