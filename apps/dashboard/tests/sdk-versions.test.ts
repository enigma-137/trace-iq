import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SDK_VERSIONS } from '../src/lib/sdkVersions';

const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const npmVersion = (path: string) => (JSON.parse(repoFile(path)) as { version: string }).version;
const lineVersion = (path: string, pattern: RegExp) => repoFile(path).match(pattern)?.[1];

describe('SDK_VERSIONS', () => {
  // The docs and install prompts show these numbers. If an SDK manifest is bumped for a
  // release, bump the catalog with it so the docs never advertise an old version.
  it('matches each SDK manifest', () => {
    expect(SDK_VERSIONS).toEqual({
      javascript: npmVersion('packages/sdk-js/package.json'),
      node: npmVersion('packages/node/package.json'),
      reactNative: npmVersion('packages/react-native/package.json'),
      flutter: lineVersion('packages/sdk-flutter/pubspec.yaml', /^version:\s*(\S+)/m),
      python: lineVersion('sdks/python/pyproject.toml', /^version\s*=\s*"([^"]+)"/m),
      rust: lineVersion('sdks/rust/Cargo.toml', /^version\s*=\s*"([^"]+)"/m)
    });
  });
});
