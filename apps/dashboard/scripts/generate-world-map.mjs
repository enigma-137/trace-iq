// Regenerates public/maps/world-dots.svg, the static dot grid behind the
// overview Locations map. Run with `npm run generate:world-map` after changing
// the options below; the output is committed so pages never build it at runtime.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import DottedMap from 'dotted-map';

const dottedMap = new DottedMap({
  height: 100,
  grid: 'diagonal',
  projection: { name: 'equirectangular' },
});

const svg = dottedMap
  .getSVG({
    radius: 0.22,
    color: '#a3a3a3',
    shape: 'circle',
    backgroundColor: 'transparent',
  })
  .replace(/>\s+</g, '><')
  .trim();

const outFile = fileURLToPath(new URL('../public/maps/world-dots.svg', import.meta.url));
writeFileSync(outFile, `${svg}\n`);
console.log(`Wrote ${outFile} (${(svg.length / 1024).toFixed(1)} KB)`);
