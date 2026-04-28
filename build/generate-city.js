'use strict';
/**
 * City Site Generator
 * Usage: node build/generate-city.js <citySlug>
 *
 * Reads build/cities/<slug>.json, clones the Burbank source files with
 * city-specific token replacements, and writes output to dist/<slug>/.
 */
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node build/generate-city.js <citySlug>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load city config
// ---------------------------------------------------------------------------
const configPath = path.join(__dirname, 'cities', `${slug}.json`);
if (!fs.existsSync(configPath)) {
  console.error(`City config not found: ${configPath}`);
  process.exit(1);
}
const city = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const SOURCE = path.resolve(__dirname, '..');           // repo root
const DIST   = path.join(SOURCE, 'dist', slug);        // dist/<slug>/

// ---------------------------------------------------------------------------
// File lists
// ---------------------------------------------------------------------------
const ROOT_PAGES = [
  'index.html', 'about.html', 'contact.html', 'faqs.html',
  'free-inspection.html', 'gallery.html', 'reviews.html', 'roofcheck.html',
];
if (city.showHauling !== false) ROOT_PAGES.push('hauling.html');

const SERVICE_PAGES = [
  'services/commercial-roofing.html',
  'services/flat-roof.html',
  'services/free-inspection-service.html',
  'services/gutter-replacement.html',
  'services/maintenance.html',
  'services/metal-roof.html',
  'services/residential-roofing.html',
  'services/roof-repair.html',
  'services/skylights.html',
  'services/spf-foam-roof.html',
  'services/tile-roof.html',
  'services/tpo-roof.html',
];

const ALL_PAGES = ROOT_PAGES.concat(SERVICE_PAGES);

// ---------------------------------------------------------------------------
// Token map — applied in order; compound strings before their components
// ---------------------------------------------------------------------------
const STRING_TOKENS = [
  // Brand name (compound first: "Burbank Roofing" with space)
  ['Burbank Roofing',             `${city.cityName} Roofing`],
  // Logo nav text (no space: "BurbankRoofing.com" capital B)
  ['BurbankRoofing.com',          city.domain],
  // URLs (lowercase b)
  ['burbankroofing.com',          city.domain],
  // Phone
  ['818.252.9422',                city.phone],
  ['8182529422',                  city.phoneRaw],
  // JSON-LD schema strings (before standalone "Burbank" replacement)
  ['"addressLocality": "Burbank"', `"addressLocality": "${city.cityName}"`],
  ['"name": "Burbank Roofing"',   `"name": "${city.cityName} Roofing"`],
  // Meta author attribute
  ['content="Burbank Roofing"',   `content="${city.cityName} Roofing"`],
  // Region name in body copy
  ['San Fernando Valley',         city.cityName],
  // og:description lists specific cities — replace with generic city mention to avoid duplicates
  ['serving Burbank, Glendale, Pasadena & LA County', `serving ${city.cityName} and LA County`],
  // Hero H1 all-caps version
  ['BURBANK',                     city.cityNameUpper],
  // Remaining standalone city references (capital B, after compound cases above)
  ['Burbank',                     city.cityName],
];

function applyStringTokens(content) {
  let result = content;
  for (const [find, replace] of STRING_TOKENS) {
    result = result.split(find).join(replace);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Regex replacements (structured/dynamic values)
// ---------------------------------------------------------------------------
function applyRegexTokens(content) {
  let result = content;

  // areaServed JSON array in schema
  result = result.replace(
    /"areaServed": \[[^\]]+\]/,
    `"areaServed": ${JSON.stringify(city.areaServed)}`
  );

  // Schema geo coordinates
  result = result.replace(/"latitude": [\-\d.]+/,  `"latitude": ${city.lat}`);
  result = result.replace(/"longitude": [\-\d.]+/, `"longitude": ${city.lng}`);

  // Google Site Verification meta tag
  if (!city.gscVerification) {
    // Remove the entire tag and its newline
    result = result.replace(/\s*<meta name="google-site-verification"[^>]*>\s*\n?/g, '\n    ');
  } else {
    result = result.replace(
      'kUCdEY-NcKh_8P1p_W25WIDbNY-3UN0LP2v4ovhH5ys',
      city.gscVerification
    );
  }

  // Remove hauling nav links if disabled for this city
  if (city.showHauling === false) {
    result = result.replace(
      /<li><a href="(?:\.\.\/)?hauling\.html"[^>]*>Hauling<\/a><\/li>\s*/g,
      ''
    );
    // Also remove the hauling service from JSON-LD schema
    result = result.replace(
      /\s*\{"@type": "Offer", "itemOffered": \{"@type": "Service", "name": "Dump Trailer Hauling & Junk Removal"\}\},?/g,
      ''
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Inject theme CSS <link> before </head>
// ---------------------------------------------------------------------------
function injectThemeLink(content, isServicePage) {
  const href = isServicePage ? '../css/theme.css' : 'css/theme.css';
  const tag  = `    <link rel="stylesheet" href="${href}">`;
  return content.replace('</head>', `${tag}\n</head>`);
}

// ---------------------------------------------------------------------------
// Inject source_domain hidden field script before </body>
// ---------------------------------------------------------------------------
function injectSourceDomainScript(content) {
  const script = [
    '    <script>',
    '      /* Lead source attribution - appends source_domain to every form */',
    '      document.querySelectorAll(\'form\').forEach(function(f) {',
    '        var h = document.createElement(\'input\');',
    '        h.type = \'hidden\'; h.name = \'source_domain\';',
    '        h.value = window.location.hostname;',
    '        f.appendChild(h);',
    '      });',
    '    </script>',
  ].join('\n');
  return content.replace('</body>', `${script}\n</body>`);
}

// ---------------------------------------------------------------------------
// Inject city-specific content at placeholder comments
// ---------------------------------------------------------------------------
function injectCityContent(content) {
  if (city.cityIntro && content.includes('<!-- CITY_INTRO -->')) {
    content = content.replace(
      '<!-- CITY_INTRO -->',
      `<p class="city-intro-text">${city.cityIntro}</p>`
    );
  }

  if (city.cityFAQ && typeof city.cityFAQ === 'object' && content.includes('<!-- CITY_FAQ -->')) {
    const { question, answer } = city.cityFAQ;
    const faqHtml = [
      '<div class="faq-item">',
      `                    <div class="faq-question">${question}</div>`,
      `                    <div class="faq-answer"><p>${answer}</p></div>`,
      '                </div>',
    ].join('\n');
    content = content.replace('<!-- CITY_FAQ -->', faqHtml);
  }

  return content;
}

// ---------------------------------------------------------------------------
// Full HTML processing pipeline
// ---------------------------------------------------------------------------
function processHtml(content, isServicePage) {
  let result = content;
  result = applyStringTokens(result);
  result = applyRegexTokens(result);
  result = injectThemeLink(result, isServicePage);
  result = injectSourceDomainScript(result);
  result = injectCityContent(result);
  return result;
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------
function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

// ---------------------------------------------------------------------------
// Copy static assets
// ---------------------------------------------------------------------------
function copyStaticAssets() {
  // Base CSS (shared, unchanged)
  mkdirp(path.join(DIST, 'css'));
  copyFile(
    path.join(SOURCE, 'css', 'styles.css'),
    path.join(DIST, 'css', 'styles.css')
  );

  // Theme CSS — look up by designTheme; fall back to empty file with a warning
  const themeSrc = path.join(__dirname, 'themes', `${city.designTheme}.css`);
  if (fs.existsSync(themeSrc)) {
    copyFile(themeSrc, path.join(DIST, 'css', 'theme.css'));
  } else {
    console.warn(`  [WARN] Theme file not found: ${city.designTheme}.css — skipping theme overrides`);
    fs.writeFileSync(path.join(DIST, 'css', 'theme.css'), '/* No theme overrides */\n');
  }

  // JS (shared, unchanged)
  mkdirp(path.join(DIST, 'js'));
  copyFile(
    path.join(SOURCE, 'js', 'main.js'),
    path.join(DIST, 'js', 'main.js')
  );

  // Base images
  mkdirp(path.join(DIST, 'images'));
  for (const img of ['favicon.svg', 'logo.svg', 'logo-white.svg']) {
    const src = path.join(SOURCE, 'images', img);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(DIST, 'images', img));
    }
  }

  // Hero image: precedence order:
  //   1. images/hero-{slug}.jpg   (city-specific custom)
  //   2. build/themes/{heroImageRegional} (regional placeholder)
  //   3. images/hero-bg.png       (Burbank default)
  const heroCustom   = path.join(SOURCE, 'images', `hero-${slug}.jpg`);
  const heroRegional = path.join(__dirname, 'themes', city.heroImageRegional || '');
  const heroDefault  = path.join(SOURCE, 'images', 'hero-bg.png');

  let heroSrc = heroDefault;
  if (fs.existsSync(heroCustom)) {
    heroSrc = heroCustom;
    console.log(`  [HERO] Using city-specific: hero-${slug}.jpg`);
  } else if (city.heroImageRegional && fs.existsSync(heroRegional)) {
    heroSrc = heroRegional;
    console.log(`  [HERO] Using regional: ${city.heroImageRegional}`);
  } else {
    console.log(`  [HERO] Using default Burbank hero (replace later)`);
  }
  copyFile(heroSrc, path.join(DIST, 'images', 'hero-bg.png'));

  // Gallery (copy all files)
  const gallerySrc  = path.join(SOURCE, 'images', 'gallery');
  const galleryDest = path.join(DIST, 'images', 'gallery');
  if (fs.existsSync(gallerySrc) && fs.statSync(gallerySrc).isDirectory()) {
    mkdirp(galleryDest);
    for (const f of fs.readdirSync(gallerySrc)) {
      const filePath = path.join(gallerySrc, f);
      if (fs.statSync(filePath).isFile()) {
        copyFile(filePath, path.join(galleryDest, f));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Generate sitemap.xml
// ---------------------------------------------------------------------------
function generateSitemap() {
  const today  = new Date().toISOString().split('T')[0];
  const domain = city.domain;

  const allUrls = [
    ...ROOT_PAGES.map(p    => `https://${domain}/${p === 'index.html' ? '' : p}`),
    ...SERVICE_PAGES.map(p => `https://${domain}/${p}`),
  ];

  const entries = allUrls.map((url) => {
    const priority = url === `https://${domain}/` ? '1.0' : '0.8';
    return [
      '  <url>',
      `    <loc>${url}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      '    <changefreq>monthly</changefreq>',
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n');
  }).join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    '</urlset>',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml);
}

// ---------------------------------------------------------------------------
// Generate robots.txt
// ---------------------------------------------------------------------------
function generateRobots() {
  const content = [
    'User-agent: *',
    'Allow: /',
    `Sitemap: https://${city.domain}/sitemap.xml`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(DIST, 'robots.txt'), content);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function run() {
  console.log(`\nGenerating ${city.cityName} Roofing → dist/${slug}/`);

  mkdirp(DIST);
  mkdirp(path.join(DIST, 'services'));

  copyStaticAssets();

  let processed = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const page of ALL_PAGES) {
    const srcPath = path.join(SOURCE, page);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  [SKIP] Source not found: ${page}`);
      skipped++;
      continue;
    }

    const isServicePage = page.startsWith('services/');
    const rawContent    = fs.readFileSync(srcPath, 'utf8');

    try {
      const output   = processHtml(rawContent, isServicePage);
      const destPath = path.join(DIST, page);
      mkdirp(path.dirname(destPath));
      fs.writeFileSync(destPath, output);
      processed++;
    } catch (err) {
      console.error(`  [ERROR] ${page}: ${err.message}`);
      errors++;
    }
  }

  generateSitemap();
  generateRobots();

  console.log(`  ✓ ${processed} HTML pages written${skipped ? `, ${skipped} skipped` : ''}${errors ? `, ${errors} errors` : ''}`);
  console.log(`  → dist/${slug}/\n`);

  if (errors > 0) process.exit(1);
}

run();
