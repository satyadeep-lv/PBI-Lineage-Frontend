#!/usr/bin/env python3
"""Compose the Home page walkthrough animation from capture.cjs output.

    node scripts/walkthrough/capture.cjs      # dev server running
    python scripts/walkthrough/compose.py     # Python 3 + Pillow

Reads scripts/walkthrough/.frames/<theme>/manifest.json and writes, per theme:
  public/how-to-use-<theme>.gif   the looping walkthrough
  public/how-to-use-<theme>.png   a still poster (the Overview step) for prefers-reduced-motion

Every frame is a browser-window chrome bar (window dots + address pill) above
the screenshot, with a numbered caption pill over its bottom-left corner. The
cursor eases from where it last clicked to the next target, the target's hover
state appears as it arrives, a teal ripple marks the click, then the next screen
cuts in and holds. Each screen gets one adaptive palette shared by all of its
frames (no dithering), so text stays crisp and nothing flickers while the cursor
moves; only the changed region of each frame is stored.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
FRAMES_DIR = HERE / ".frames"
PUBLIC_DIR = REPO / "public"

MAX_BYTES = 4 * 1024 * 1024
FALLBACK_WIDTH = 1120
HOST = "pbi-lineage-explorer"
POSTER_SHOT = "03-overview"

MOVE_FRAMES = 8
MOVE_FRAME_MS = 40
ARRIVE_MS = 90
RIPPLE_MS = (60, 60, 90)
BEFORE_MS = 320
MIN_HOVER_HOLD_MS = 600

THEMES = {
    "light": {
        "chrome_bg": "#fdfefe",
        "chrome_border": "#dfe5e7",
        "address_bg": "#f2f5f6",
        "address_border": "#dfe5e7",
        "address_muted": "#536174",
        "address_strong": "#1d2939",
        "caption_bg": (11, 30, 35),
        "caption_alpha": 0.95,
        "caption_border": (11, 30, 35),
        "caption_text": "#f2f4f7",
        "caption_step": "#22cfc0",
        "ripple": "#008294",
        "cursor_fill": "#ffffff",
        "cursor_outline": "#0b1e23",
    },
    "dark": {
        "chrome_bg": "#0b1e23",
        "chrome_border": "#244047",
        "address_bg": "#071317",
        "address_border": "#244047",
        "address_muted": "#98a2b3",
        "address_strong": "#f2f4f7",
        "caption_bg": (242, 244, 247),
        "caption_alpha": 0.96,
        "caption_border": (242, 244, 247),
        "caption_text": "#0b1e23",
        "caption_step": "#006f7d",
        "ripple": "#00b7a8",
        "cursor_fill": "#ffffff",
        "cursor_outline": "#071317",
    },
}
WINDOW_DOTS = ("#ff5f57", "#febc2e", "#28c840")

FONT_REGULAR = [Path("C:/Windows/Fonts/segoeui.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]
FONT_SEMIBOLD = [Path("C:/Windows/Fonts/seguisb.ttf"), Path("C:/Windows/Fonts/segoeuib.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")]


def rgb(value) -> tuple[int, int, int]:
    if isinstance(value, tuple):
        return value
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def load_font(candidates: list[Path], size: int) -> ImageFont.ImageFont:
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    try:
        return ImageFont.load_default(size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def ease_in_out(t: float) -> float:
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


class Composer:
    def __init__(self, theme: str, manifest: dict, width: int):
        self.theme = theme
        self.colors = THEMES[theme]
        self.manifest = manifest
        viewport = manifest["viewport"]
        self.scale = width / viewport["width"]
        self.shot_w = width
        self.shot_h = round(viewport["height"] * self.scale)
        self.chrome_h = round(40 * self.scale)
        self.width = width
        self.height = self.shot_h + self.chrome_h
        s = self.scale
        self.font_address = load_font(FONT_REGULAR, round(13 * s))
        self.font_address_strong = load_font(FONT_SEMIBOLD, round(13 * s))
        self.font_caption = load_font(FONT_SEMIBOLD, round(17 * s))
        self.cursor_sprite, self.cursor_offset = self._cursor_sprite()
        self._cache: dict[tuple[str, str], Image.Image] = {}

    # -- static layers ------------------------------------------------------

    def _chrome(self, route: str) -> Image.Image:
        c, s = self.colors, self.scale
        bar = Image.new("RGB", (self.width, self.chrome_h), rgb(c["chrome_bg"]))
        draw = ImageDraw.Draw(bar)
        draw.line([(0, self.chrome_h - 1), (self.width, self.chrome_h - 1)], fill=rgb(c["chrome_border"]), width=1)
        radius = 6 * s
        for index, color in enumerate(WINDOW_DOTS):
            cx, cy = (18 + index * 20) * s, self.chrome_h / 2
            draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=rgb(color))

        pill_w = min(round(560 * s), self.width - round(220 * s))
        pill_h = round(26 * s)
        left = (self.width - pill_w) // 2
        top = (self.chrome_h - pill_h) // 2
        draw.rounded_rectangle([left, top, left + pill_w, top + pill_h], radius=pill_h // 2, fill=rgb(c["address_bg"]), outline=rgb(c["address_border"]))

        # A small padlock, then host / segments.
        lx, ly = left + round(14 * s), top + pill_h / 2
        muted = rgb(c["address_muted"])
        draw.arc([lx - 3.2 * s, ly - 6.5 * s, lx + 3.2 * s, ly + 0.5 * s], 180, 360, fill=muted, width=max(1, round(1.4 * s)))
        draw.rounded_rectangle([lx - 4.6 * s, ly - 2.4 * s, lx + 4.6 * s, ly + 5.2 * s], radius=round(1.5 * s), fill=muted)

        segments = [segment for segment in route.split("/") if segment]
        x = lx + round(14 * s)
        baseline_y = top + pill_h / 2
        pieces = [(HOST, self.font_address, muted)]
        for segment in segments:
            pieces.append(("  /  ", self.font_address, muted))
            pieces.append((segment, self.font_address_strong, rgb(c["address_strong"])))
        for text, font, color in pieces:
            draw.text((x, baseline_y), text, font=font, fill=color, anchor="lm")
            x += draw.textlength(text, font=font)
        return bar

    def _caption(self, frame: Image.Image, step: int, total: int, caption: str) -> None:
        c, s = self.colors, self.scale
        counter = f"{step} / {total}"
        measure = ImageDraw.Draw(frame)
        gap = round(12 * s)
        pad_x, height = round(16 * s), round(38 * s)
        counter_w = measure.textlength(counter, font=self.font_caption)
        caption_w = measure.textlength(caption, font=self.font_caption)
        width = round(pad_x * 2 + counter_w + gap + caption_w)
        left = round(16 * s)
        top = self.height - round(16 * s) - height

        overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        # Soft shadow, then the pill itself.
        shadow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle([left, top + round(3 * s), left + width, top + height + round(3 * s)], radius=height // 2, fill=(0, 0, 0, 60))
        shadow = shadow.filter(ImageFilter.GaussianBlur(round(6 * s)))
        overlay.alpha_composite(shadow)
        draw.rounded_rectangle([left, top, left + width, top + height], radius=height // 2, fill=(*c["caption_bg"], round(255 * c["caption_alpha"])))
        cy = top + height / 2
        draw.text((left + pad_x, cy), counter, font=self.font_caption, fill=(*rgb(c["caption_step"]), 255), anchor="lm")
        draw.text((left + pad_x + counter_w + gap, cy), caption, font=self.font_caption, fill=(*rgb(c["caption_text"]), 255), anchor="lm")
        base = frame.convert("RGBA")
        base.alpha_composite(overlay)
        frame.paste(base.convert("RGB"))

    def screen(self, shot: dict, file: str) -> Image.Image:
        """A captured screenshot inside the window chrome, with the step caption."""
        key = (shot["id"], file)
        if key not in self._cache:
            shot_img = Image.open(FRAMES_DIR / self.theme / file).convert("RGB")
            if shot_img.width != self.shot_w:
                shot_img = shot_img.resize((self.shot_w, self.shot_h), Image.Resampling.LANCZOS)
            frame = Image.new("RGB", (self.width, self.height))
            frame.paste(self._chrome(shot["path"]), (0, 0))
            frame.paste(shot_img, (0, self.chrome_h))
            self._caption(frame, shot["step"], shot["totalSteps"], shot["caption"])
            self._cache[key] = frame
        return self._cache[key]

    # -- cursor and ripple ---------------------------------------------------

    def _cursor_sprite(self) -> tuple[Image.Image, tuple[int, int]]:
        """An anti-aliased arrow (white fill, dark outline, soft shadow); returns (sprite, tip offset)."""
        c = self.colors
        ss = 4  # supersampling
        size = 1.18 * self.scale
        points = [(0, 0), (0, 17), (4.2, 13.2), (7.2, 19.6), (10.2, 18.3), (7.3, 12.1), (12.6, 12.1)]
        pad = 6
        box = round((20 + pad * 2) * size)
        big = Image.new("RGBA", (box * ss, box * ss), (0, 0, 0, 0))
        poly = [((x * size + pad * size) * ss, (y * size + pad * size) * ss) for x, y in points]
        shadow = Image.new("RGBA", big.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).polygon([(x + 1.2 * ss * size, y + 1.8 * ss * size) for x, y in poly], fill=(0, 0, 0, 90))
        shadow = shadow.filter(ImageFilter.GaussianBlur(1.6 * ss * size))
        big.alpha_composite(shadow)
        ImageDraw.Draw(big).polygon(poly, fill=(*rgb(c["cursor_fill"]), 255), outline=(*rgb(c["cursor_outline"]), 255), width=round(1.5 * ss * size))
        sprite = big.resize((box, box), Image.Resampling.LANCZOS)
        tip = round(pad * size)
        return sprite, (tip, tip)

    def _ripple(self, index: int) -> Image.Image:
        s = self.scale
        ss = 4
        radius = (9, 15, 21)[index] * s
        stroke = (3.0, 2.4, 1.8)[index] * s
        ring_alpha = (230, 150, 70)[index]
        fill_alpha = (70, 40, 14)[index]
        size = math.ceil((radius + stroke + 2) * 2)
        big = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
        center = size * ss / 2
        r = radius * ss
        color = rgb(self.colors["ripple"])
        draw = ImageDraw.Draw(big)
        draw.ellipse([center - r, center - r, center + r, center + r], fill=(*color, fill_alpha), outline=(*color, ring_alpha), width=round(stroke * ss))
        return big.resize((size, size), Image.Resampling.LANCZOS)

    def to_frame(self, point: dict) -> tuple[float, float]:
        return point["x"] * self.scale, point["y"] * self.scale + self.chrome_h

    def with_cursor(self, image: Image.Image, point: tuple[float, float] | None, ripple: int | None = None) -> Image.Image:
        if point is None:
            return image
        frame = image.convert("RGBA")
        x, y = point
        if ripple is not None:
            ring = self._ripple(ripple)
            frame.alpha_composite(ring, (round(x - ring.width / 2), round(y - ring.height / 2)))
        ox, oy = self.cursor_offset
        frame.alpha_composite(self.cursor_sprite, (round(x - ox), round(y - oy)))
        return frame.convert("RGB")

    def swatch(self) -> Image.Image:
        """Cursor and ripple pixels over both grounds, so the shot palettes include them."""
        base = Image.new("RGB", (240, 60), rgb(self.colors["chrome_bg"]))
        dark = Image.new("RGB", (240, 60), rgb(self.colors["address_strong"]))
        strip = Image.new("RGB", (240, 120))
        strip.paste(base, (0, 0))
        strip.paste(dark, (0, 60))
        for row in (0, 60):
            for index in range(3):
                strip = self.with_cursor(strip, (30 + index * 70, row + 30), ripple=index)
        return strip

    # -- palette -------------------------------------------------------------

    def palette_for(self, images: list[Image.Image]) -> Image.Image:
        """One adaptive palette per screen (254 colors + fixed UI colors), leaving an index free for transparency."""
        c = self.colors
        fixed = [rgb(c[key]) for key in ("chrome_bg", "chrome_border", "address_bg", "address_border", "address_muted", "address_strong", "caption_text", "caption_step", "ripple", "cursor_fill", "cursor_outline")]
        fixed += [rgb(color) for color in WINDOW_DOTS]
        fixed = list(dict.fromkeys(fixed))
        sample = [*images, self.swatch()]
        stack = Image.new("RGB", (max(image.width for image in sample), sum(image.height for image in sample)))
        y = 0
        for image in sample:
            stack.paste(image, (0, y))
            y += image.height
        adaptive = stack.quantize(colors=255 - len(fixed), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        colors = adaptive.getpalette()[: (255 - len(fixed)) * 3]
        for color in fixed:
            colors.extend(color)
        palette = Image.new("P", (1, 1))
        palette.putpalette(colors)
        return palette

    # -- timeline ------------------------------------------------------------

    def timeline(self) -> list[tuple[Image.Image, int, str]]:
        """(RGB frame, duration ms, shot id) for the whole loop."""
        frames: list[tuple[Image.Image, int, str]] = []
        for shot in self.manifest["shots"]:
            base = self.screen(shot, shot["file"])
            cursor = self.to_frame(shot["cursor"]) if shot.get("cursor") else None
            frames.append((self.with_cursor(base, cursor), shot["hold"], shot["id"]))
            for move in shot["moves"]:
                start = self.to_frame(move["from"]) if move.get("from") else cursor
                end = self.to_frame(move["to"])
                moving = self.screen(shot, move["baseFile"]) if move.get("baseFile") else base
                hover = self.screen(shot, move["hoverFile"]) if move.get("hoverFile") else moving
                if move.get("baseFile"):
                    frames.append((self.with_cursor(moving, start), BEFORE_MS, shot["id"]))
                start = start or end
                dx, dy = end[0] - start[0], end[1] - start[1]
                distance = math.hypot(dx, dy)
                # A gentle arc reads as a hand-moved pointer rather than a straight robotic line.
                bow = min(36 * self.scale, distance * 0.08)
                nx, ny = (-dy / distance, dx / distance) if distance else (0.0, 0.0)
                for index in range(1, MOVE_FRAMES + 1):
                    t = index / MOVE_FRAMES
                    e = ease_in_out(t)
                    lift = math.sin(math.pi * e) * bow
                    point = (start[0] + dx * e + nx * lift, start[1] + dy * e + ny * lift)
                    arrived = index == MOVE_FRAMES
                    duration = MOVE_FRAME_MS
                    if arrived:
                        duration = ARRIVE_MS if move["click"] else max(MIN_HOVER_HOLD_MS, move.get("holdAfter") or 0)
                    frames.append((self.with_cursor(hover if arrived else moving, point), duration, shot["id"]))
                if move["click"]:
                    for ripple, duration in enumerate(RIPPLE_MS):
                        frames.append((self.with_cursor(hover, end, ripple=ripple), duration, shot["id"]))
                cursor = end
        return frames

    def shot_screens(self, shot: dict) -> list[Image.Image]:
        files = [shot["file"]]
        for move in shot["moves"]:
            files += [move.get("baseFile"), move.get("hoverFile")]
        return [self.screen(shot, file) for file in dict.fromkeys(file for file in files if file)]

    def write_gif(self, path: Path) -> tuple[int, int]:
        timeline = self.timeline()
        palettes = {shot["id"]: self.palette_for(self.shot_screens(shot)) for shot in self.manifest["shots"]}
        paletted = [image.quantize(palette=palettes[shot_id], dither=Image.Dither.NONE) for image, _, shot_id in timeline]
        durations = [duration for _, duration, _ in timeline]
        paletted[0].save(path, save_all=True, append_images=paletted[1:], duration=durations, loop=0, disposal=1, optimize=True)
        return path.stat().st_size, len(paletted)

    def write_poster(self, path: Path) -> None:
        shot = next((item for item in self.manifest["shots"] if item["id"] == POSTER_SHOT), self.manifest["shots"][0])
        self.screen(shot, shot["file"]).save(path, optimize=True)


def replace_file(source: Path, target: Path) -> None:
    """Move `source` over `target`. Windows can refuse the one-step replace of a file
    the dev server has served, so fall back to moving the old file aside first."""
    try:
        source.replace(target)
        return
    except PermissionError:
        if not target.exists():
            raise
    backup = target.with_suffix(".old" + target.suffix)
    backup.unlink(missing_ok=True)
    target.rename(backup)
    try:
        source.rename(target)
    except OSError:
        backup.rename(target)  # put the previous animation back rather than leave none
        raise
    try:
        backup.unlink()
    except OSError:
        print(f"note: could not delete {backup.name}; remove it once nothing holds it open")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--theme", choices=sorted(THEMES), action="append", help="Theme(s) to compose (default: all captured)")
    parser.add_argument("--width", type=int, help="Force an output width instead of native, falling back to 1120 over 4 MB")
    args = parser.parse_args()

    themes = args.theme or [theme for theme in THEMES if (FRAMES_DIR / theme / "manifest.json").exists()]
    if not themes:
        raise SystemExit("No captures found. Run `node scripts/walkthrough/capture.cjs` first.")
    for theme in themes:
        manifest = json.loads((FRAMES_DIR / theme / "manifest.json").read_text(encoding="utf-8"))
        width = args.width or manifest["viewport"]["width"]
        gif_path = PUBLIC_DIR / f"how-to-use-{theme}.gif"
        tmp_path = gif_path.with_suffix(".tmp.gif")
        composer = Composer(theme, manifest, width)
        size, count = composer.write_gif(tmp_path)
        if size > MAX_BYTES and width > FALLBACK_WIDTH:
            print(f"{theme}: {size / 1048576:.2f} MB at {width}px is over budget, recomposing at {FALLBACK_WIDTH}px")
            composer = Composer(theme, manifest, FALLBACK_WIDTH)
            size, count = composer.write_gif(tmp_path)
        replace_file(tmp_path, gif_path)
        poster_path = PUBLIC_DIR / f"how-to-use-{theme}.png"
        composer.write_poster(poster_path)
        print(f"{theme}: {gif_path.relative_to(REPO)} {composer.width}x{composer.height}, {count} frames, {size / 1048576:.2f} MB; poster {poster_path.relative_to(REPO)} {poster_path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
