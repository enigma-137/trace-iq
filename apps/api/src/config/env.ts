import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const loadedFiles = new Set<string>();

loadEnvironmentFiles();

function loadEnvironmentFiles() {
  const candidates = collectCandidateFiles();

  for (const file of candidates) {
    loadEnvFile(file);
  }
}

function collectCandidateFiles() {
  const files: string[] = [];
  const starts = [process.cwd(), __dirname];

  for (const start of starts) {
    for (const directory of walkUp(start, 6)) {
      files.push(join(directory, '.env'));
      files.push(join(directory, '.env.local'));
      files.push(join(directory, 'apps', 'api', '.env'));
      files.push(join(directory, 'apps', 'api', '.env.local'));
    }
  }

  return [...new Set(files.map((file) => resolve(file)))];
}

function walkUp(start: string, maxDepth: number) {
  const directories: string[] = [];
  let current = resolve(start);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    directories.push(current);

    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return directories.reverse();
}

function loadEnvFile(file: string) {
  if (loadedFiles.has(file) || !existsSync(file)) {
    return;
  }

  loadedFiles.add(file);
  const contents = readFileSync(file, 'utf8');

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

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

