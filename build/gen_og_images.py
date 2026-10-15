from PIL import Image, ImageDraw, ImageFont
import os

src = Image.open(r"images\hero-bg.png").convert("RGB")

def make_og_image(bg, out_path, brand_name, tagline, accent_color, dark_color):
    w, h = bg.size
    target_w, target_h = 1200, 630
    scale = max(target_w/w, target_h/h)
    new_w, new_h = int(w*scale), int(h*scale)
    img = bg.resize((new_w, new_h), Image.LANCZOS)
    x = (new_w - target_w) // 2
    y = (new_h - target_h) // 2
    img = img.crop((x, y, x+target_w, y+target_h))

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw_ov = ImageDraw.Draw(overlay)
    grad_top = int(target_h * 0.25)
    for i in range(grad_top, target_h):
        alpha = int(210 * (i - grad_top) / (target_h - grad_top))
        r = int(dark_color[0] * alpha / 255)
        g = int(dark_color[1] * alpha / 255)
        b = int(dark_color[2] * alpha / 255)
        draw_ov.line([(0, i), (target_w, i)], fill=(r, g, b, alpha))

    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    font_bold = font_reg = None
    for fp in [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\Arial.ttf"]:
        if os.path.exists(fp):
            font_bold = ImageFont.truetype(fp, 72)
            font_reg  = ImageFont.truetype(fp, 34)
            break
    if font_bold is None:
        font_bold = font_reg = ImageFont.load_default()

    # Accent bar at bottom
    draw.rectangle([(0, target_h - 6), (target_w, target_h)], fill=accent_color)

    # Brand name centred
    bb = draw.textbbox((0, 0), brand_name, font=font_bold)
    tw = bb[2] - bb[0]
    draw.text(((target_w - tw) // 2, target_h - 195), brand_name,
              font=font_bold, fill=(255, 255, 255))

    # Tagline centred
    bb2 = draw.textbbox((0, 0), tagline, font=font_reg)
    tw2 = bb2[2] - bb2[0]
    draw.text(((target_w - tw2) // 2, target_h - 105), tagline,
              font=font_reg, fill=accent_color)

    img.save(out_path, "JPEG", quality=90)
    print(f"Saved {out_path}  ({os.path.getsize(out_path)//1024} KB)")

make_og_image(
    src,
    r"images\og-image.jpg",
    "BURBANK ROOFING",
    "Expert Roofing · San Fernando Valley · CA Lic #1109337",
    (255, 92, 52),
    (15, 17, 21),
)

make_og_image(
    src,
    r"palmcrest\images\og-image.jpg",
    "PALM CREST ROOFING",
    "LA County's Trusted Roofers · CA Lic #1109337",
    (82, 183, 136),
    (15, 27, 24),
)
