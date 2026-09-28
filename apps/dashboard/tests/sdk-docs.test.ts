import { describe, expect, it } from 'vitest';
import { sdkDocsSections } from '../src/app/docs/sdk-docs';

describe('SDK documentation navigation', () => {
  it('keeps every shipped SDK discoverable', () => {
    expect(sdkDocsSections.map(({ id }) => id)).toEqual([
      'javascript',
      'flutter',
      'react-native',
      'node',
      'python',
      'swift',
      'kotlin',
      'rust',
      'php'
    ]);
  });
});
