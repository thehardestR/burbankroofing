'use strict';
/**
 * Bulk City Site Builder
 * Usage: node build/build-all.js
 *
 * Reads all JSON files in build/cities/ and runs generate-city.js for each.
 * Pass --only sfv to target only cities with region matching "sfv" (case-insensitive).
 */
const fs          = require('fs');
const path        = require('path');
const { execSync } = require('child_process');

const CITIES_DIR    = path.join(__dirname, 'cities');
const GENERATOR     = path.join(__dirname, 'generate-city.js');
const filterArg     = (() => {
  const idx = process.argv.indexOf('--only');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// Gather city configs
let files = fs.readdirSync(CITIES_DIR)
  .filter(f => f.endsWith('.json'))
  .sort();

if (filterArg) {
  const filter = filterArg.toLowerCase();
  files = files.filter(f => {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(CITIES_DIR, f), 'utf8'));
      return (
        cfg.region?.toLowerCase().includes(filter) ||
        cfg.designTheme?.toLowerCase().includes(filter) ||
        cfg.citySlug?.toLowerCase().includes(filter)
      );
    } catch { return false; }
  });
  console.log(`\nFilter --only "${filterArg}" matched ${files.length} city config(s).`);
}

console.log(`\nBuilding ${files.length} city site(s)...\n${'─'.repeat(50)}`);

const results = { success: [], failed: [] };
const start   = Date.now();

for (const file of files) {
  const slug = path.basename(file, '.json');
  try {
    execSync(`node "${GENERATOR}" ${slug}`, { stdio: 'inherit' });
    results.success.push(slug);
  } catch (err) {
    console.error(`[FAIL] ${slug}: ${err.message}`);
    results.failed.push(slug);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log('─'.repeat(50));
console.log(`Build complete in ${elapsed}s`);
console.log(`  ✓ ${results.success.length} succeeded`);
if (results.failed.length > 0) {
  console.log(`  ✗ ${results.failed.length} failed: ${results.failed.join(', ')}`);
  process.exit(1);
}
console.log('');
