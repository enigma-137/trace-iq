import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Failed sign-in', () => {
  const source = readFileSync(new URL('../src/app/auth/login/AuthForm.tsx', import.meta.url), 'utf8');

  it('clears the password when the credentials are rejected', () => {
    expect(source).toMatch(/if \(authResult\.error\) \{[\s\S]*?if \(mode === 'signin'\) setPassword\(''\);[\s\S]*?reportAuthFailure/);
  });

  it('clears the password when sign-in throws', () => {
    expect(source).toMatch(/\} catch \(error\) \{\s*if \(mode === 'signin'\) setPassword\(''\);\s*await reportAuthFailure/);
  });
});
