import { describe, expect, it } from 'vitest';
import { ownerLabel } from '../src/components/library/owner-label';

describe('ownerLabel', () => {
  it('shows "You" for the viewer, even when the email is known', () => {
    expect(ownerLabel('user_1', 'me@acme.com', 'user_1')).toBe('You');
  });

  it("shows a teammate's email", () => {
    expect(ownerLabel('user_2', 'teammate@acme.com', 'user_1')).toBe('teammate@acme.com');
  });

  it('never falls back to "Member" when the email is unknown', () => {
    expect(ownerLabel('user_2', null, 'user_1')).toBe('Unknown');
    expect(ownerLabel('user_2', undefined, 'user_1')).toBe('Unknown');
  });
});
