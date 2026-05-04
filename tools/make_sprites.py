#!/usr/bin/env python3
"""
BitPet sprite sheet builder — Clawd edition.

Reads the Clawd spritesheet from ~/.codex/pets/clawd-2/spritesheet.webp,
extracts 9 animation strips (5 frames each), normalises every frame to
FRAME_SIZE×FRAME_SIZE, and packs them into a single horizontal sprite sheet.

Usage:
    python3 tools/make_sprites.py

Output:
    src-tauri/assets/sprites/bitpet.png
    src-tauri/assets/sprites/manifest.json
    src/sprites/bitpet.png          (copy for frontend dev server)
    src/sprites/manifest.json
    public/sprites/bitpet.png       (copy for Vite public)
    public/sprites/manifest.json
"""

import json, os, shutil
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    os.system("pip3 install Pillow --quiet --user")
    from PIL import Image

ROOT      = Path(__file__).parent.parent
SRC_SHEET = Path.home() / ".codex" / "pets" / "clawd-2" / "spritesheet.webp"
FRAME_SIZE   = 64   # output frame size
SPRITE_PAD_T = 10  # transparent pixels added at top → headband never touches canvas edge

# ── Source sheet geometry (detected via transparent-band analysis) ──────────
# 6 content columns, 9 content rows; transparent separators between them.
# Col 6 (967-1144) contains the complete headphone frame (with white headband).
COL_REGIONS = [(5, 186), (197, 378), (393, 568), (582, 761), (776, 952), (967, 1144)]
ROW_REGIONS = [
    (5,    202),   # strip 0 – idle / headphones   (real top y=5,  +17px headband)
    (197,  410),   # strip 1 – walk right           (real top y=197, +40px)
    (443,  632),   # strip 2 – walk left
    (657,  833),   # strip 3 – hover / wave         (real top y=657, +10px)
    (837,  1055),  # strip 4 – launch / lightbulb   (real top y=837, +31px)
    (1072, 1246),  # strip 5 – sleeping squish       (real top y=1072, +18px)
    (1278, 1455),  # strip 6 – active / laptop
    (1489, 1655),  # strip 7 – eating / crouch
    (1689, 1842),  # strip 8 – deep sleep flat
]

# ── Animation manifest ───────────────────────────────────────────────────────
# Row index → 0-based strip index in ROW_REGIONS.
# User's row assignments (1-indexed):
#   Row 1 → idle variant (headphones)   → strip 0
#   Row 2 → drag right                  → strip 1
#   Row 3 → drag left                   → strip 2
#   Row 4 → mouse hover                 → strip 3
#   Row 5 → launch / startup            → strip 4
#   Row 6 → hungry                      → strip 5
#   Row 7 → active (AI response / code) → strip 6  (laptop)
#   Row 8 → eating / playing            → strip 7
#   Row 9 → sleeping (fully flat)       → strip 8
ANIMATIONS = [
    # name          strip  fps   row in spritesheet (1-indexed)
    ("idle",          0,   1),   # Row 1 — idle
    ("walk_right",    1,   1),   # Row 2 — drag right
    ("walk_left",     2,   1),   # Row 3 — drag left
    ("hover",         3,   1),   # Row 4 — mouse hover
    ("launch",        4,   1),   # Row 5 — startup lightbulb
    ("sleeping",      5,   1),   # Row 6 — hungry
    ("active",        6,   1),   # Row 7 — laptop / AI working
    ("eating",        7,   1),   # Row 8 — crouching / eating
    ("deep_sleep",    8,   1),   # Row 9 — fully flat / deep sleep
]
FRAMES_PER_STRIP = len(COL_REGIONS)  # 6


def extract_strip(img: Image.Image, strip_idx: int) -> list[Image.Image]:
    """Return FRAMES_PER_STRIP frames for a given strip, normalised to FRAME_SIZE."""
    rs, re = ROW_REGIONS[strip_idx]
    frames = []
    for cs, ce in COL_REGIONS:
        raw = img.crop((cs, rs, ce, re)).convert("RGBA")
        sw, sh = raw.size
        # Build a padded square: add SPRITE_PAD_T pixels at the top so the
        # headband arc never touches the canvas edge.
        side = max(sw, sh) + SPRITE_PAD_T
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        x_off = (side - sw) // 2
        y_off = SPRITE_PAD_T + (side - SPRITE_PAD_T - sh) // 2
        square.paste(raw, (x_off, y_off), raw)
        frame = square.resize((FRAME_SIZE, FRAME_SIZE), Image.NEAREST)
        frames.append(frame)
    return frames


def build_sheet(all_frames: list[Image.Image]) -> Image.Image:
    total = len(all_frames)
    sheet = Image.new("RGBA", (FRAME_SIZE * total, FRAME_SIZE), (0, 0, 0, 0))
    for i, f in enumerate(all_frames):
        sheet.paste(f, (i * FRAME_SIZE, 0), f)
    return sheet


def build_manifest(animations: list[tuple]) -> dict:
    manifest = {"frameWidth": FRAME_SIZE, "frameHeight": FRAME_SIZE, "animations": {}}
    cursor = 0
    for name, strip_idx, fps in animations:
        manifest["animations"][name] = {
            "start": cursor,
            "end":   cursor + FRAMES_PER_STRIP - 1,
            "fps":   fps,
        }
        cursor += FRAMES_PER_STRIP
    return manifest


def main():
    if not SRC_SHEET.exists():
        print(f"ERROR: source sheet not found at {SRC_SHEET}")
        return

    print(f"Loading: {SRC_SHEET}")
    src = Image.open(SRC_SHEET).convert("RGBA")
    print(f"Source size: {src.size}")

    all_frames: list[Image.Image] = []
    for name, strip_idx, fps in ANIMATIONS:
        frames = extract_strip(src, strip_idx)
        all_frames.extend(frames)
        print(f"  {name:12s} ← strip {strip_idx}  ({fps}fps × {len(frames)}frames)")

    sheet    = build_sheet(all_frames)
    manifest = build_manifest(ANIMATIONS)

    total_frames = len(all_frames)
    print(f"\nSheet: {sheet.size}  ({total_frames} frames × {FRAME_SIZE}px)")

    for out_dir in [
        ROOT / "src-tauri" / "assets" / "sprites",
        ROOT / "src" / "sprites",
        ROOT / "public" / "sprites",
        ROOT / "dist" / "sprites",
    ]:
        out_dir.mkdir(parents=True, exist_ok=True)
        sheet.save(out_dir / "bitpet.png", "PNG")
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"  → {out_dir}")

    print("\nDone!")


if __name__ == "__main__":
    main()
