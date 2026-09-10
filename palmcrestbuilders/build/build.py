#!/usr/bin/env python3
"""
Palm Crest Builders — Static Site Builder (Python)

Generates:
  - services/<slug>.html      from build/services/<slug>.json
  - areas/<slug>/index.html   from build/areas/<slug>.json
  - areas/index.html          (directory page)
  - gallery.html              (from images/gallery/*)
  - sitemap.xml

Run: `python build/build.py` from the palmcrestbuilders/ folder (or any cwd).
"""

import datetime
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SVC_DIR = os.path.join(HERE, "services")
ARE_DIR = os.path.join(HERE, "areas")
OUT_SVC = os.path.join(ROOT, "services")
OUT_ARE = os.path.join(ROOT, "areas")
GALLERY_DIR = os.path.join(ROOT, "images", "gallery")
GALLERY_DATA = os.path.join(ROOT, "data", "gallery.json")

SITE = {
    "name": "Palm Crest Builders",
    "phone": "818.252.9422",
    "tel": "8182529422",
    "email": "info@palmcrestbuildersinc.com",
    "domain": "https://palmcrestbuildersinc.com",
    "license": "CA Lic. #[Pending]",
    "street": "1812 W. Burbank Blvd #5996",
    "city_locality": "Burbank",
    "region": "CA",
    "postal": "91506",
}


# ---------- shared partials ----------
def header(prefix=""):
    return f"""    <header class="header">
        <div class="header-top"><div class="container">
            <div class="header-promo">⚡ Free Project Consultations — LA County-Wide</div>
            <div class="header-trust"><span>🛡️ Licensed &amp; Insured</span><span>⭐ 5-Star Rated</span></div>
            <a href="tel:{SITE['tel']}" class="phone-link">📞 {SITE['phone']}</a>
        </div></div>
        <nav class="navbar"><div class="container">
            <a href="{prefix}index.html" class="logo-link"><img src="{prefix}images/logo-white.svg" alt="{SITE['name']}" height="64"></a>
            <button class="nav-toggle" aria-label="Toggle menu"><span></span><span></span><span></span></button>
            <ul class="nav-menu">
                <li><a href="{prefix}index.html">Home</a></li>
                <li><a href="{prefix}about.html">About</a></li>
                <li><a href="{prefix}index.html#services">Services</a></li>
                <li><a href="{prefix}areas/">Service Areas</a></li>
                <li><a href="{prefix}gallery.html">Gallery</a></li>
                <li><a href="{prefix}reviews.html">Reviews</a></li>
                <li><a href="{prefix}faqs.html">FAQs</a></li>
                <li><a href="{prefix}contact.html" class="btn btn-primary">Get Quote</a></li>
            </ul>
        </div></nav>
    </header>"""


def footer(prefix=""):
    return f"""    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div class="footer-brand"><img src="{prefix}images/logo-white.svg" alt="{SITE['name']}"><p>Licensed Southern California general building contractor. {SITE['license']} · Class B.</p></div>
                <div class="footer-links"><h4>Services</h4><ul>
                    <li><a href="{prefix}services/whole-home-remodeling.html">Whole-Home Remodeling</a></li>
                    <li><a href="{prefix}services/kitchen-remodeling.html">Kitchen Remodeling</a></li>
                    <li><a href="{prefix}services/bathroom-remodeling.html">Bathroom Remodeling</a></li>
                    <li><a href="{prefix}services/room-additions.html">Room Additions</a></li>
                    <li><a href="{prefix}services/adus.html">ADUs</a></li>
                    <li><a href="{prefix}services/new-home-construction.html">New Home Construction</a></li>
                </ul></div>
                <div class="footer-links"><h4>Company</h4><ul>
                    <li><a href="{prefix}about.html">About</a></li>
                    <li><a href="{prefix}areas/">Service Areas</a></li>
                    <li><a href="{prefix}gallery.html">Gallery</a></li>
                    <li><a href="{prefix}reviews.html">Reviews</a></li>
                    <li><a href="{prefix}faqs.html">FAQs</a></li>
                    <li><a href="{prefix}contact.html">Contact</a></li>
                </ul></div>
                <div class="footer-contact"><h4>Contact</h4>
                    <p>📞 <a href="tel:{SITE['tel']}">{SITE['phone']}</a></p>
                    <p>📧 <a href="mailto:{SITE['email']}">{SITE['email']}</a></p>
                    <p>📍 {SITE['street']}, {SITE['city_locality']}, {SITE['region']} {SITE['postal']}</p>
                    <p>Serving all of Los Angeles County</p>
                    <p>{SITE['license']} · Class B</p>
                </div>
            </div>
            <div class="footer-bottom"><p>&copy; 2025 {SITE['name']}. All rights reserved.</p></div>
        </div>
    </footer>
    <script src="{prefix}js/main.js"></script>"""


def head(title, description, canonical, prefix=""):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <meta name="description" content="{description}">
    <link rel="canonical" href="{canonical}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:url" content="{canonical}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="{SITE['name']}">
    <link rel="icon" type="image/svg+xml" href="{prefix}images/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="{prefix}css/styles.css">
</head>
<body>"""


def area_service_grid(prefix, city):
    return f"""            <div class="services-grid">
                <a href="{prefix}services/whole-home-remodeling.html" class="service-card"><div class="service-icon">🏠</div><h3>Whole-Home Remodeling</h3><p>Full renovations for {city} homes.</p></a>
                <a href="{prefix}services/kitchen-remodeling.html" class="service-card"><div class="service-icon">🍳</div><h3>Kitchen Remodeling</h3><p>Custom kitchens built to fit your space.</p></a>
                <a href="{prefix}services/bathroom-remodeling.html" class="service-card"><div class="service-icon">🛁</div><h3>Bathroom Remodeling</h3><p>Refreshes to full gut-and-rebuild.</p></a>
                <a href="{prefix}services/room-additions.html" class="service-card"><div class="service-icon">➕</div><h3>Room Additions</h3><p>Add square footage and value.</p></a>
                <a href="{prefix}services/adus.html" class="service-card"><div class="service-icon">🏡</div><h3>ADUs</h3><p>Detached, attached &amp; garage-conversion ADUs.</p></a>
                <a href="{prefix}services/new-home-construction.html" class="service-card"><div class="service-icon">🏗️</div><h3>New Home Construction</h3><p>Ground-up custom homes in {city}.</p></a>
                <a href="{prefix}services/garage-conversions.html" class="service-card"><div class="service-icon">🚪</div><h3>Garage Conversions</h3><p>Turn a garage into living space.</p></a>
                <a href="{prefix}services/foundation-structural.html" class="service-card"><div class="service-icon">🧱</div><h3>Foundation &amp; Structural</h3><p>Foundations, framing &amp; retrofits.</p></a>
            </div>"""


# ---------- service page ----------
def build_service_page(data):
    prefix = "../"
    canonical = f"{SITE['domain']}/services/{data['slug']}.html"
    benefits = "\n".join(f"                    <li>{b}</li>" for b in data.get("benefits", []))
    process = "\n".join(
        f'                <h4 style="color:var(--secondary-color);margin-top:25px;">Step {i + 1}: {p["title"]}</h4>\n                <p>{p["desc"]}</p>'
        for i, p in enumerate(data.get("process", []))
    )
    faqs = "\n".join(
        f'                <div class="faq-item"><div class="faq-question">{f["q"]}</div><div class="faq-answer"><p>{f["a"]}</p></div></div>'
        for f in data.get("faqs", [])
    )

    body_extra_html = ""
    if data.get("body_extra"):
        be = data["body_extra"]
        body_extra_html = f'<h3>{be["heading"]}</h3>\n                <p>{be["text"]}</p>'

    ld = {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": data["h1"],
        "description": data["metaDescription"],
        "url": canonical,
        "provider": {
            "@type": "GeneralContractor",
            "name": SITE["name"],
            "telephone": "+1-818-252-9422",
            "url": SITE["domain"] + "/",
            "hasCredential": "CSLB Class B License (pending)",
            "address": {
                "@type": "PostalAddress",
                "streetAddress": SITE["street"],
                "addressLocality": SITE["city_locality"],
                "addressRegion": SITE["region"],
                "postalCode": SITE["postal"],
                "addressCountry": "US",
            },
        },
        "areaServed": {"@type": "AdministrativeArea", "name": "Los Angeles County, California"},
    }
    ld_str = json.dumps(ld, indent=2, ensure_ascii=False)

    faq_section = ""
    if faqs:
        faq_section = f"""<section class="section section-gray">
        <div class="container">
            <h2 class="section-title">{data['h1']} FAQs</h2>
            <div class="faq-list">
{faqs}
            </div>
        </div>
    </section>"""

    return f"""{head(f"{data['h1']} | {SITE['name']} | LA County", data['metaDescription'], canonical, prefix)}
    <script type="application/ld+json">
{ld_str}
    </script>
{header(prefix)}

    <section class="page-header">
        <div class="container">
            <h1>{data['h1']}</h1>
            <p>{data['tagline']}</p>
        </div>
    </section>

    <section class="section">
        <div class="container">
            <div class="service-content">
                <h2>{data['intro_h2']}</h2>
                <p>{data['intro']}</p>

                <h3>Key Benefits</h3>
                <ul class="service-list">
{benefits}
                </ul>

                <h3>Our Process</h3>
{process}

                {body_extra_html}

                <div class="service-cta">
                    <h3>Get a Free {data['h1']} Estimate</h3>
                    <p>Call now or request a consultation online. Free estimates across LA County.</p>
                    <a href="tel:{SITE['tel']}" class="btn btn-outline btn-lg">📞 {SITE['phone']}</a>
                    <a href="{prefix}free-consultation.html" class="btn btn-primary btn-lg">Free Consultation</a>
                </div>
            </div>
        </div>
    </section>

    {faq_section}

{footer(prefix)}
</body>
</html>"""


# ---------- area / city page ----------
def build_area_page(data):
    prefix = "../../"
    canonical = f"{SITE['domain']}/areas/{data['slug']}/"
    hoods = data.get("neighborhoods") or []
    neighborhoods = ""
    if hoods:
        joined = " • ".join(hoods)
        neighborhoods = f'<div class="city-neighborhoods"><h3>Neighborhoods We Serve in {data["city"]}</h3><p>{joined}</p></div>'

    if data.get("local_note"):
        local_note = f"<p>{data['local_note']}</p>"
    else:
        local_note = (
            f'<p class="city-placeholder-note">Detailed neighborhood content for {data["city"]} '
            f'is being added. Call <a href="tel:{SITE["tel"]}" style="color:var(--primary-color);font-weight:700;">'
            f'{SITE["phone"]}</a> for same-day information about building and remodeling in your specific area.</p>'
        )

    faqs = "\n".join(
        f'                <div class="faq-item"><div class="faq-question">{f["q"]}</div><div class="faq-answer"><p>{f["a"]}</p></div></div>'
        for f in data.get("faqs", [])
    )

    faq_section = ""
    if faqs:
        faq_section = f"""<section class="section section-gray">
        <div class="container">
            <h2 class="section-title">{data['city']} Contractor FAQs</h2>
            <div class="faq-list">
{faqs}
            </div>
        </div>
    </section>"""

    title = f"{data['city']} General Contractor | {SITE['name']} | Remodels, Additions & ADUs"
    description = (
        f"Licensed general building contractor serving {data['city']}, CA. Kitchen & bath remodels, "
        f"room additions, ADUs, garage conversions & new construction. Free consultations. Call {SITE['phone']}."
    )

    return f"""{head(title, description, canonical, prefix)}
{header(prefix)}

    <section class="city-hero">
        <div class="container">
            <h1>{data['city']} General Contractor</h1>
            <p class="city-subtitle">Licensed Remodeling &amp; Construction in {data['city']}, CA &nbsp;·&nbsp; {SITE['license']}</p>
            <div class="hero-buttons">
                <a href="tel:{SITE['tel']}" class="btn btn-primary btn-lg">📞 {SITE['phone']}</a>
                <a href="{prefix}free-consultation.html" class="btn btn-outline btn-lg">Free Consultation</a>
            </div>
        </div>
    </section>

    <section class="section">
        <div class="container">
            <div class="city-intro">
                <p><strong>{SITE['name']} serves {data['city']} and the surrounding communities</strong> as a licensed Class B general building contractor — whole-home remodels, kitchen and bathroom renovations, room additions, ADUs, garage conversions, foundations, and ground-up new construction. Every project is built by our own crews, permitted through the local building department, and backed by our workmanship warranty.</p>
                {local_note}
            </div>

            {neighborhoods}

            <h2 style="text-align:center;margin:60px 0 30px;color:var(--primary-color);">Construction &amp; Remodeling Services in {data['city']}</h2>
{area_service_grid(prefix, data['city'])}
        </div>
    </section>

    {faq_section}

    <section class="cta">
        <div class="container">
            <h2>Free Project Consultation in {data['city']}</h2>
            <p>No pressure, no obligation — just honest advice and a clear estimate.</p>
            <a href="tel:{SITE['tel']}" class="btn btn-outline btn-lg">📞 {SITE['phone']}</a>
            <a href="{prefix}free-consultation.html" class="btn btn-primary btn-lg">Request Online</a>
        </div>
    </section>

{footer(prefix)}
</body>
</html>"""


# ---------- areas index ----------
def build_areas_index(areas):
    prefix = "../"
    canonical = f"{SITE['domain']}/areas/"
    order = [
        "San Fernando Valley",
        "Santa Clarita Valley & North County",
        "San Gabriel Valley",
        "Westside & Beaches",
        "South Bay & Long Beach",
        "Southeast LA County",
    ]
    clusters = {c: [] for c in order}
    for a in areas:
        c = a.get("cluster") or "Other"
        clusters.setdefault(c, []).append(a)

    sections = []
    for c in clusters:
        if not clusters[c]:
            continue
        cards = "\n".join(
            f'                <a href="{a["slug"]}/" class="area-card"><h3>{a["city"]}</h3><p>{a.get("short_blurb", "Licensed remodeling & construction — free consultations.")}</p></a>'
            for a in clusters[c]
        )
        sections.append(
            f'            <h2 class="area-cluster-title">{c}</h2>\n            <div class="areas-grid">\n{cards}\n            </div>'
        )
    sections_html = "\n\n".join(sections)

    title = f"Service Areas | {SITE['name']} | Los Angeles County"
    description = (
        f"{SITE['name']} service areas across Los Angeles County — licensed general building contractor "
        f"serving 75+ cities with remodels, additions, ADUs & new construction."
    )

    return f"""{head(title, description, canonical, prefix)}
{header(prefix)}

    <section class="areas-hero">
        <div class="container">
            <h1>Service Areas</h1>
            <p>Licensed remodeling and construction across Los Angeles County — pick your city for local info and recent projects.</p>
        </div>
    </section>

    <section class="section">
        <div class="container">
{sections_html}
        </div>
    </section>

    <section class="cta">
        <div class="container">
            <h2>Don't See Your City?</h2>
            <p>We build throughout LA County and Southern California — give us a call.</p>
            <a href="tel:{SITE['tel']}" class="btn btn-outline btn-lg">📞 {SITE['phone']}</a>
            <a href="{prefix}contact.html" class="btn btn-primary btn-lg">Contact Us</a>
        </div>
    </section>

{footer(prefix)}
</body>
</html>"""


# ---------- gallery ----------
def build_gallery():
    prefix = ""
    canonical = f"{SITE['domain']}/gallery.html"
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    images = []
    if os.path.isdir(GALLERY_DIR):
        images = sorted(
            f for f in os.listdir(GALLERY_DIR) if os.path.splitext(f)[1].lower() in exts
        )
    items = "\n".join(
        f'                <div class="gallery-item"><img src="images/gallery/{img}" alt="{SITE["name"]} construction project" loading="lazy"></div>'
        for img in images
    )

    title = f"Project Gallery | {SITE['name']} | LA County Remodels & Additions"
    description = (
        f"Recent remodeling, room addition, ADU, and construction projects completed by "
        f"{SITE['name']} across Los Angeles County."
    )

    return f"""{head(title, description, canonical, prefix)}
{header(prefix)}

    <section class="page-header">
        <div class="container">
            <h1>Project Gallery</h1>
            <p>Recent work from our crews across Los Angeles County.</p>
        </div>
    </section>

    <section class="section">
        <div class="container">
            <p style="text-align:center;color:var(--text-light);max-width:820px;margin:0 auto 40px;">
                Remodels, room additions, ADUs, and ground-up builds completed across Los Angeles County. Every project is built to the California Building Code by our own licensed crews.
            </p>
            <div class="gallery-filters" id="gallery-filters" hidden></div>
            <div id="gallery-groups">
                <div class="gallery-grid">
{items}
                </div>
            </div>
        </div>
    </section>

    <section class="cta">
        <div class="container">
            <h2>Ready to Start Your Project?</h2>
            <p>Book a free consultation and written estimate.</p>
            <a href="tel:{SITE['tel']}" class="btn btn-outline btn-lg">📞 {SITE['phone']}</a>
            <a href="free-consultation.html" class="btn btn-primary btn-lg">Free Consultation</a>
        </div>
    </section>

{footer(prefix)}
    <script src="js/gallery.js" defer></script>
</body>
</html>"""


# ---------- sitemap ----------
def build_sitemap(service_slugs, area_slugs):
    today = datetime.date.today().isoformat()
    base = f"{SITE['domain']}/"
    urls = [
        "", "about.html", "contact.html", "faqs.html", "reviews.html",
        "gallery.html", "free-consultation.html", "areas/",
    ]
    urls += [f"services/{s}.html" for s in service_slugs]
    urls += [f"areas/{s}/" for s in area_slugs]
    entries = "\n".join(f"  <url><loc>{base}{u}</loc><lastmod>{today}</lastmod></url>" for u in urls)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{entries}
</urlset>
"""


# ---------- gallery data (seed once; CMS owns it afterward) ----------
def build_gallery_data():
    """Seed data/gallery.json from existing images if it doesn't exist yet.
    After the first run the admin CMS is the source of truth, so we never overwrite it."""
    if os.path.exists(GALLERY_DATA):
        print("  = data/gallery.json (exists \u2014 left for the CMS to manage)")
        return
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    images = []
    if os.path.isdir(GALLERY_DIR):
        images = sorted(
            f for f in os.listdir(GALLERY_DIR) if os.path.splitext(f)[1].lower() in exts
        )
    photos = [
        {"image": f"images/gallery/{img}", "service": "uncategorized", "caption": ""}
        for img in images
    ]
    os.makedirs(os.path.dirname(GALLERY_DATA), exist_ok=True)
    with open(GALLERY_DATA, "w", encoding="utf-8") as fh:
        json.dump({"photos": photos}, fh, indent=2, ensure_ascii=False)
    print(f"  + data/gallery.json ({len(photos)} photos seeded)")


# ---------- utilities ----------
def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    print("  +", os.path.relpath(path, ROOT))


def main():
    print("Building Palm Crest Builders site...\n")

    print("Services:")
    service_files = sorted(f for f in os.listdir(SVC_DIR) if f.endswith(".json"))
    service_slugs = []
    for f in service_files:
        data = read_json(os.path.join(SVC_DIR, f))
        service_slugs.append(data["slug"])
        write_file(os.path.join(OUT_SVC, f"{data['slug']}.html"), build_service_page(data))

    print("\nAreas:")
    area_files = sorted(f for f in os.listdir(ARE_DIR) if f.endswith(".json"))
    areas = [read_json(os.path.join(ARE_DIR, f)) for f in area_files]
    area_slugs = [a["slug"] for a in areas]
    for a in areas:
        write_file(os.path.join(OUT_ARE, a["slug"], "index.html"), build_area_page(a))
    write_file(os.path.join(OUT_ARE, "index.html"), build_areas_index(areas))

    print("\nGallery:")
    write_file(os.path.join(ROOT, "gallery.html"), build_gallery())

    print("\nGallery data:")
    build_gallery_data()

    print("\nSitemap:")
    write_file(os.path.join(ROOT, "sitemap.xml"), build_sitemap(service_slugs, area_slugs))

    print(f"\nDone. {len(service_slugs)} services, {len(area_slugs)} areas.")


if __name__ == "__main__":
    main()
