# Win / loss screen art

Drop a PNG in the right bucket and the end-of-game screen uses it. No code
change, no manifest — the same rule `assets/buildings/` and
`assets/terrain/` follow.

    win/calm/1.png        a picture for a Calm victory
    win/moderate/1.png    a picture for a Moderate victory
    win/hard/1.png         a picture for a Hard victory
    loss/calm/1.png       a picture for a Calm defeat
    loss/moderate/1.png   a picture for a Moderate defeat
    loss/hard/1.png        a picture for a Hard defeat

**Add as many as you want to a bucket** — `1.png`, `2.png`, `3.png`, up to
12 — and one is picked at random each time that screen shows. An empty or
missing bucket leaves the built-in painted scene exactly as it always drew
(js/defeatart.js / js/victoryart.js); a picture you supply replaces it
outright, full stop.

## Naming

- **Numbers only, starting at 1, no gaps.** The game tries `1.png`, and only
  tries `2.png` once `1.png` is actually there — so a bucket with `1.png`
  and `3.png` but no `2.png` only ever shows `1.png`.
- **All lowercase**, always. GitHub Pages is case-sensitive.
- **Folder names are exact**: `win` or `loss`; `calm`, `moderate`, or `hard`.

## What to author

- **Any size, any aspect ratio** — the picture is scaled to COVER the frame
  (cropped at the edges, never squashed or letterboxed), the same way a
  phone wallpaper fills a lock screen.
- The frame displays at a **4:3 box** (200:150) on screen, so a 4:3 image
  needs no cropping at all; anything else is centre-cropped to fit.
- These are shown **large and readable** — unlike the tiny building icons
  elsewhere in `assets/`, a scenic, detailed painting is exactly right here.

Bump `CFG.ART_V` in js/config.js when you re-upload a file under a name it
already had, or the Pages CDN keeps serving the old one. New filenames
(including adding `2.png` to a bucket that only had `1.png`) don't need it.
