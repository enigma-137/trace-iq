import { describe, expect, it } from 'vitest';
import { PARTNERS } from '../src/components/TrustedTeams';

describe('Trusted teams section partners', () => {
  it('contains unique partner names and links without duplicates', () => {
    const names = PARTNERS.map((p) => p.name.toLowerCase().trim());
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);

    const hrefs = PARTNERS.map((p) => p.href.toLowerCase().replace(/\/+$/, ''));
    const uniqueHrefs = new Set(hrefs);
    expect(hrefs.length).toBe(uniqueHrefs.size);
  });

  it('includes FUNAAB Life with the correct live URL and logo', () => {
    const funaab = PARTNERS.find((p) => p.name.toLowerCase().includes('funaab'));
    expect(funaab).toBeDefined();
    expect(funaab?.name).toBe('FUNAAB Life');
    expect(funaab?.href).toBe('https://funaab-life.pages.dev/');
    expect(funaab?.logo).toBeDefined();
    expect(typeof funaab?.logo).toBe('function');
  });

  it('provides complete partner details for all listed teams', () => {
    expect(PARTNERS.length).toBeGreaterThanOrEqual(3);
    for (const partner of PARTNERS) {
      expect(partner.name.trim().length).toBeGreaterThan(0);
      expect(partner.href.startsWith('https://')).toBe(true);
      expect(partner.logo).toBeDefined();
    }
  });
});
