// Copies the country-flag-icons SVGs into public/flags so <CountryFlag> can load
// them as plain static files: no JS bundle cost, cached by the browser, and they
// work on self-hosted installs without internet access. Runs before dev and build.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve('country-flag-icons/package.json')), '3x2');
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'flags');

if (!existsSync(source)) {
  console.warn(`copy-flags: ${source} not found; flags will fall back to a globe icon.`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
