import pathlib, subprocess

ROOT = pathlib.Path(r'c:\CodeProjects\Burbank Roofing Website\palmcrest\images')

# ── INLINE LAYOUT:  PALM  [tree]  CREST  ─────────────────────────────────────
#                        ROOFING
#
# viewBox 310×125.  Palm tree centered at x=155, crown y=45, trunk base y=88.
# Fronds spread ±40px → x=115..195, leaving ~12px gap to text on each side.
# PALM  right-anchored at x=103  (103 + ~12gap + 115 frond-edge = clean)
# CREST left-anchored  at x=207  (195 frond-edge + 12gap = 207)

FRONDS = [
    # crown at (180,45), frond spread ±40px → x=140..220
    "M 180,45 C 180,20 153,18 140,45  C 153,32 173,42 180,47 Z",  # outer-left
    "M 180,45 C 180,22 163,15 153,24  C 163,20 177,40 180,47 Z",  # inner-left
    "M 180,45 C 177,22 173,10 180, 8  C 187,10 183,22 180,45 Z",  # center
    "M 180,45 C 180,22 197,15 207,24  C 197,20 183,40 180,47 Z",  # inner-right
    "M 180,45 C 180,20 207,18 220,45  C 207,32 187,42 180,47 Z",  # outer-right
]

frond_paths = '\n'.join(f'  <path d="{p}" fill="url(#pg)"/>' for p in FRONDS)

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 115" role="img" aria-label="Palm Crest Roofing">
  <defs>
    <linearGradient id="pg" x1="180" y1="88" x2="180" y2="8" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#6D1260"/>
      <stop offset="40%"  stop-color="#C83040"/>
      <stop offset="72%"  stop-color="#F07020"/>
      <stop offset="100%" stop-color="#F8C018"/>
    </linearGradient>
  </defs>
  <!-- Roofline silhouette — only the ridge lines, no walls/fill -->
  <polyline points="0,60 55,42 55,20 70,20 70,37 180,0 360,60"
            fill="none" stroke="#3D1455" stroke-opacity="0.25" stroke-width="3" stroke-linejoin="miter"/>
  <!-- Trunk — slight lean, mostly straight -->
  <path d="M 177,88 C 180,72 179,58 178,45 L 183,45 C 184,58 185,72 184,88 Z"
        fill="url(#pg)"/>
""" + frond_paths + """
  <circle cx="180" cy="45" r="5" fill="url(#pg)"/>
  <!-- PALM · tree · CREST inline -->
  <text x="158" y="88" text-anchor="end"
        font-family="Montserrat,sans-serif"
        font-size="40" font-weight="400" fill="#3D1455">PALM</text>
  <text x="202" y="88" text-anchor="start"
        font-family="Montserrat,sans-serif"
        font-size="40" font-weight="400" fill="#3D1455">CREST</text>
  <text x="180" y="108" text-anchor="middle"
        font-family="Montserrat,Arial,sans-serif"
        font-size="20" font-weight="700" letter-spacing="6" fill="#E07018">ROOFING</text>
</svg>"""

(ROOT / 'logo.svg').write_text(SVG, encoding='utf-8')
SVG_WHITE = (SVG
    .replace('stroke="#E07018"', 'stroke="#FFFFFF"')
    .replace('stroke="#3D1455"', 'stroke="rgba(255,255,255,0.35)"')
    .replace('fill="#E07018" fill-opacity="0.05"', 'fill="#FFFFFF" fill-opacity="0.04"')
    .replace('fill="#3D1455"', 'fill="#FFFFFF"')
    .replace('fill="#E07018"', 'fill="rgba(255,255,255,0.88)"')
    .replace('fill="rgba(255,255,255,0.88)">ROOFING</text>', 'fill="#E07018">ROOFING</text>'))
(ROOT / 'logo-white.svg').write_text(SVG_WHITE, encoding='utf-8')
print("SVGs written")

HTML = ROOT / 'logo-preview.html'
OUT  = ROOT / '_logo_check.png'
SVG_SCALED_LG = SVG.replace('<svg ', '<svg width="360" height="115" ', 1)
SVG_WHITE_SCALED_LG = SVG_WHITE.replace('<svg ', '<svg width="360" height="115" ', 1)
SVG_SCALED_SM = SVG.replace('<svg ', '<svg width="202" height="65" ', 1)
SVG_WHITE_SCALED_SM = SVG_WHITE.replace('<svg ', '<svg width="202" height="65" ', 1)

HTML.write_text(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400&display=swap" rel="stylesheet">
<style>
body{{margin:0;background:#eceae6;display:flex;flex-direction:column;align-items:center;gap:20px;padding:28px}}
.row{{display:flex;gap:20px;align-items:center}}
.light{{background:#fff;padding:24px 40px;border-radius:10px;box-shadow:0 2px 14px rgba(0,0,0,.12)}}
.dark{{background:#162816;padding:24px 40px;border-radius:10px}}
</style></head><body>
<div class="row">
  <div class="light">{SVG_SCALED_LG}</div>
  <div class="dark">{SVG_WHITE_SCALED_LG}</div>
</div>
<div class="row">
  <div class="light">{SVG_SCALED_SM}</div>
  <div class="dark" style="padding:12px 24px">{SVG_WHITE_SCALED_SM}</div>
</div>
</body></html>""", encoding='utf-8')

r = subprocess.run([r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '--headless=new','--hide-scrollbars','--disable-gpu','--no-sandbox',
    f'--screenshot={OUT}','--window-size=900,420', str(HTML)], capture_output=True, timeout=25)
print(f"PNG: {OUT.stat().st_size} bytes" if OUT.exists() else f"err: {r.stderr[-300:]}")
