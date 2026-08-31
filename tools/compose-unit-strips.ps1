# ============================================================================
# CHARACTER-CLASS STRIP COMPOSER  (assets/units/unit-{kind}-{dir}-{pose}.png)
#
# Turns a folder of PixelLab animation frames into the horizontal strips that
# Assets.setUnitFrames slices at load time.
#
# ASCII ONLY, DELIBERATELY. Windows PowerShell 5.1 decodes a BOM-less .ps1 as
# CP1252, so a UTF-8 em-dash inside a string literal decodes to a curly quote
# that terminates the string and the whole file stops parsing. Keep every byte
# in this file 7-bit ASCII; do not "improve" the punctuation.
#
# THE WINDOW IS FIXED, NOT FITTED. Every frame of every direction and pose is
# cropped through the SAME square window of -Target px, bottom-anchored on the
# union opaque bbox and centred horizontally. Two reasons it must be fixed:
#
#   1. NATIVE DENSITY. Units draw into a CFG.TILE (32px) box and the whole
#      procedural cast authors at 64px - an exact 2:1 integer downscale. A
#      content-fitted window lands on whatever size the art happened to be
#      (the first deer came out 104px = 3.25:1), and a non-integer nearest-
#      neighbour downscale throws away ~69% of the source: 1px antler tines
#      and legs sample in and out as the camera zooms, which reads as shimmer.
#      -Target is therefore required to be a whole multiple of the 32px tile.
#   2. ONE SCALE FOR THE ROSTER. Fitting per-animal would silently make a deer
#      and a wolf different sizes on the map.
#
# Content that does not FIT the window is a hard error, never a rescale - the
# fix is to regenerate smaller, not to resample at a fractional ratio.
#
#   powershell -File tools/compose-unit-strips.ps1 `
#     -InDir <frames> -OutDir assets/units -Kind deer [-Target 64]
#
# Frame files are named {dir}-{pose}-{index}.png, dir in s,se,e,ne,n,nw,w,sw.
# ============================================================================
param(
  [Parameter(Mandatory = $true)][string]$InDir,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [Parameter(Mandatory = $true)][string]$Kind,
  [int]$Target = 64
)
$TILE = 32   # CFG.TILE - the box every unit is drawn into
if ($Target -le 0 -or ($Target % $TILE) -ne 0) {
  throw ("-Target must be a whole multiple of the ${TILE}px tile (32, 64, 96...) so the " +
         "downscale to the draw box stays an integer ratio. Got $Target.")
}
Add-Type -AssemblyName System.Drawing
$files = Get-ChildItem $InDir -Filter '*.png'
if (-not $files) { throw "no frames in $InDir" }

# --- union opaque bbox PER DIRECTION (alpha >= 128 counts as opaque) ---
# One window SIZE for everything (scale coherence), but the window POSITION
# is computed per direction: PixelLab places each direction independently on
# its canvas (measured: no single wolf frame was wider than 58px, yet the
# all-directions union spanned 66 purely from positional drift), and there
# is no cross-direction registration to preserve. Within a direction, walk
# and idle DO share the window, so an animal that stops never teleports.
$dirBox = @{}
$cw = 0; $ch = 0
foreach ($f in $files) {
  $dir = ($f.BaseName -split '-')[0]
  $img = [System.Drawing.Bitmap]::FromFile($f.FullName)
  $cw = $img.Width; $ch = $img.Height
  if (-not $dirBox[$dir]) { $dirBox[$dir] = @{ minX = [int]::MaxValue; minY = [int]::MaxValue; maxX = -1; maxY = -1 } }
  $b = $dirBox[$dir]
  for ($y = 0; $y -lt $img.Height; $y++) {
    for ($x = 0; $x -lt $img.Width; $x++) {
      if ($img.GetPixel($x, $y).A -ge 128) {
        if ($x -lt $b.minX) { $b.minX = $x }; if ($x -gt $b.maxX) { $b.maxX = $x }
        if ($y -lt $b.minY) { $b.minY = $y }; if ($y -gt $b.maxY) { $b.maxY = $y }
      }
    }
  }
  $img.Dispose()
}
# --- THE GROUND LINE IS THE ANCHOR (learned on the bear's fight sheet) ---
# The window bottom sits 1px under the STANDING poses' feet (walk+idle union),
# not under the union of everything: a strike pose legitimately follows
# through BELOW the ground line (the bear's slam lands 2-5px under its own
# feet), and anchoring on that would float the walking animal above its
# shadow. Sub-ground strike pixels are CROPPED at the ground instead - which
# is where a slam lands anyway. A crop is not a resample; width overflow and
# TOP overflow are still hard errors.
$standBox = @{}
foreach ($f in $files) {
  $parts = $f.BaseName -split '-'
  $dir = $parts[0]; $pose = $parts[1]
  if ($pose -ne 'walk' -and $pose -ne 'idle') { continue }
  $img = [System.Drawing.Bitmap]::FromFile($f.FullName)
  if (-not $standBox[$dir]) { $standBox[$dir] = @{ maxY = -1 } }
  for ($y = $img.Height - 1; $y -ge 0; $y--) {
    $hit = $false
    for ($x = 0; $x -lt $img.Width; $x++) { if ($img.GetPixel($x, $y).A -ge 128) { $hit = $true; break } }
    if ($hit) { if ($y -gt $standBox[$dir].maxY) { $standBox[$dir].maxY = $y }; break }
  }
  $img.Dispose()
}
$win = @{}
foreach ($dir in $dirBox.Keys) {
  $b = $dirBox[$dir]
  $bw = $b.maxX - $b.minX + 1
  $groundY = if ($standBox[$dir]) { $standBox[$dir].maxY } else { $b.maxY }
  $y0 = $groundY + 1 - $Target
  $topOver = $y0 - $b.minY
  if ($bw -gt $Target) {
    throw ("direction '$dir': content ${bw}px wide does not fit the ${Target}px window. REGENERATE SMALLER. " +
           "Never rescale here: a fractional resample is the exact defect the fixed window prevents.")
  }
  if ($topOver -gt 0) {
    throw ("direction '$dir': content rises ${topOver}px above the ground-anchored ${Target}px window. " +
           "REGENERATE SMALLER. Never rescale here.")
  }
  $cropped = $b.maxY - $groundY
  $win[$dir] = @{
    x0 = $b.minX - [Math]::Floor(($Target - $bw) / 2)
    y0 = $y0                         # ground-anchored: standing feet sit 1px off the edge
  }
  $note = if ($cropped -gt 0) { "  (cropping ${cropped}px of below-ground strike)" } else { "" }
  Write-Output ("dir {0,-3} bbox {1}x{2} window origin ({3},{4}){5}" -f $dir, $bw, ($b.maxY - $b.minY + 1), $win[$dir].x0, $win[$dir].y0, $note)
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
$groups = $files | Group-Object { ($_.BaseName -replace '-\d+$', '') }
foreach ($grp in $groups) {
  $gdir = ($grp.Name -split '-')[0]
  $x0 = $win[$gdir].x0; $y0 = $win[$gdir].y0
  $frames = $grp.Group | Sort-Object { [int]($_.BaseName -replace '.*-(\d+)$', '$1') }
  $n = $frames.Count
  $strip = New-Object System.Drawing.Bitmap ($n * $Target), $Target
  $g = [System.Drawing.Graphics]::FromImage($strip)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $i = 0
  foreach ($f in $frames) {
    $img = [System.Drawing.Bitmap]::FromFile($f.FullName)
    # 1:1 blit through the window - no scaling of any kind happens here
    $g.DrawImage($img, [System.Drawing.Rectangle]::new($i * $Target, 0, $Target, $Target),
      $x0, $y0, $Target, $Target, [System.Drawing.GraphicsUnit]::Pixel)
    $img.Dispose(); $i++
  }
  $g.Dispose()
  # HARD BINARY ALPHA - compositing assumes it (Assets.setUnitFrames' contract)
  for ($y = 0; $y -lt $strip.Height; $y++) {
    for ($x = 0; $x -lt $strip.Width; $x++) {
      $p = $strip.GetPixel($x, $y)
      if ($p.A -gt 0 -and $p.A -lt 255) {
        if ($p.A -ge 128) { $strip.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $p.R, $p.G, $p.B)) }
        else { $strip.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0)) }
      }
    }
  }
  $out = Join-Path $OutDir ("unit-$Kind-" + $grp.Name + '.png')
  $strip.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $strip.Dispose()
  Write-Output ("wrote " + (Split-Path $out -Leaf) + "  ($n frames @ ${Target}px)")
}
