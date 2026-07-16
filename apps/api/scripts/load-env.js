const fs = require('node:fs');
const path = require('node:path');

const loadedFiles = new Set();

function loadEnvironmentFiles() {
  const candidates = collectCandidateFiles();

  for (const file of candidates) {
    loadEnvFile(file);
  }
}

function collectCandidateFiles() {
  const files = [];
  const starts = [process.cwd(), __dirname];

  for (const start of starts) {
    for (const directory of walkUp(start, 6)) {
      files.push(path.join(directory, '.env'));
      files.push(path.join(directory, '.env.local'));
      files.push(path.join(directory, 'apps', 'api', '.env'));
      files.push(path.join(directory, 'apps', 'api', '.env.local'));
    }
  }

  return [...new Set(files.map((file) => path.resolve(file)))];
}

function walkUp(start, maxDepth) {
  const directories = [];
  let current = path.resolve(start);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    directories.push(current);

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return directories.reverse();
}

function loadEnvFile(file) {
  if (loadedFiles.has(file) || !fs.existsSync(file)) {
    return;
  }

  loadedFiles.add(file);
  const contents = fs.readFileSync(file, 'utf8');

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripQuotes(trimmed.slice(separatorIndex + 1).trim());

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

loadEnvironmentFiles();

