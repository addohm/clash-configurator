"""Draws the placeholder app icon: three sliders on a teal rounded square.

Run: python3 tools/art/make_icon.py <out.png>   (needs Pillow)
Then: npx tauri icon <out.png>   to make every size in src-tauri/icons/.
The release kit's final icon will replace this (PLAN.md, build step 9).
"""
import sys

from PIL import Image, ImageDraw

S = 4  # draw at 4x and scale down, for smooth edges
N = 1024 * S
img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Background: rounded square with a vertical teal gradient.
pad, radius = 64 * S, 220 * S
top, bottom = (31, 160, 176), (12, 104, 118)
grad = Image.new("RGBA", (N, N))
gd = ImageDraw.Draw(grad)
for y in range(N):
    f = y / (N - 1)
    gd.line([(0, y), (N, y)], fill=tuple(round(a + (b - a) * f) for a, b in zip(top, bottom)) + (255,))
mask = Image.new("L", (N, N), 0)
ImageDraw.Draw(mask).rounded_rectangle([pad, pad, N - pad, N - pad], radius=radius, fill=255)
img.paste(grad, (0, 0), mask)

# Three slider tracks with round knobs at different positions.
white, track = (255, 255, 255, 255), (255, 255, 255, 120)
left, right, thick, knob = 260 * S, 764 * S, 44 * S, 78 * S
for y, x in ((340, 620), (512, 400), (684, 560)):
    y, x = y * S, x * S
    d.rounded_rectangle([left, y - thick // 2, right, y + thick // 2], radius=thick // 2, fill=track)
    d.rounded_rectangle([left, y - thick // 2, x, y + thick // 2], radius=thick // 2, fill=white)
    d.ellipse([x - knob, y - knob, x + knob, y + knob], fill=white)

img.resize((1024, 1024), Image.LANCZOS).save(sys.argv[1])
