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

## The card reward screen (`reward/`)

With the card system on, a run's end is the REWARD screen (js/deckscreens.js),
and it draws its own pictures from `reward/`, by filename alone:

    reward/win-wide.webp    the valley at dawn, for a victory on a landscape window
    reward/win-tall.webp    the same, composed for a phone held upright
    reward/loss-wide.webp   the valley at dusk, the hall fallen, for a defeat
    reward/loss-tall.webp   the same, upright
    reward/pedestal.png     the carved altar the card stands on (transparent)

Each backdrop has a `.jpg` beside it (the same picture at 2x, nearest-
neighbour) for a browser without WebP. They are pixel art at native size —
688x384 and 384x688 — and the screen scales them itself, by a whole factor,
so do not upscale them here. The pedestal is drawn at the card's own pixel
density, 240 x 102, the card standing 26 pixels down its top
(`DeckScreens.PLINTH` holds those numbers: change the picture's size or where
the card stands and change them with it). A missing file leaves the screen's
own painted landscape and stone drum — nothing breaks.

Those five are the screen's only pictures, because they are WORLD art — the
valley and the altar standing in it. Everything drawn over them is CHROME
(the banner and its sprigs, the laurels beside the card, the deck's little
card stack, the brackets, gems and sparks) and is drawn as vectors in code
(`DeckScreens.SVG`, `DeckUI.deckIcon`, `DeckUI.GEM_SVG`), at the device's own
resolution: do not add a PNG for any of it. `tests/deck-screens.mjs` §7
measures the rule — no raster on the reward screen, the collection or the
deck sheet but these and the card faces may be shown past its own pixels on
a 3x phone, and the pedestal never past twice its pixels (it is 2x on a
desktop today; a larger window would want a larger altar, not a stretched
one).
