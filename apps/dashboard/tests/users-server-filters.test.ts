import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Users page filters run on the server', () => {
  const view = read('../src/app/dashboard/users/UsersClientView.tsx');
  const page = read('../src/app/dashboard/users/page.tsx');

  it('sends search and tab to the API instead of filtering the loaded page', () => {
    expect(page).toContain("query.set('search', search)");
    expect(page).toContain("query.set('segment', segment)");
    expect(view).toContain("params.set('search', next)");
    expect(view).toContain("params.set('segment', next)");
    expect(view).toContain('const filteredPersons = initialPersons;');
    expect(view).not.toMatch(/initialPersons\.filter\(/);
  });

  it('restarts pagination when the search or tab changes', () => {
    expect(view.match(/params\.delete\('offset'\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('does not invent stats from the page size', () => {
    expect(page).not.toMatch(/totalCount \* 0\./);
  });
});
