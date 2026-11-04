import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatAxisNumber,
  formatLogTimestamp,
  formatTick,
  niceMax,
  sourceLabel,
  statusLabel,
  xTickIndices,
  yTicks
} from '../src/app/dashboard/logs/log-format';

describe('statusLabel', () => {
  it('writes an HTTP status the way a proxy log does, with its tone', () => {
    expect(statusLabel('success', 200)).toEqual({ text: '200 OK', tone: 'ok' });
    expect(statusLabel('success', 404)).toEqual({ text: '404 Not Found', tone: 'warn' });
    expect(statusLabel('error', 503)).toEqual({ text: '503 Service Unavailable', tone: 'error' });
    expect(statusLabel('success', 299)).toEqual({ text: '299', tone: 'ok' });
  });

  it('uses plain words for entries without a status code', () => {
    expect(statusLabel('success')).toEqual({ text: 'OK', tone: 'ok' });
    expect(statusLabel('warning')).toEqual({ text: 'Warning', tone: 'warn' });
    expect(statusLabel('error')).toEqual({ text: 'Failed', tone: 'error' });
    expect(statusLabel('pending').tone).toBe('neutral');
  });
});

describe('sourceLabel', () => {
  it('names the known sources and capitalises an unknown one', () => {
    expect(sourceLabel('api')).toBe('API');
    expect(sourceLabel('sdk')).toBe('SDK');
    expect(sourceLabel('queue')).toBe('Queue');
    expect(sourceLabel('')).toBe('Log');
  });
});

describe('formatLogTimestamp', () => {
  it('prints a sortable local date and time with milliseconds', () => {
    const d = new Date(2026, 10, 4, 19, 36, 17, 5);
    expect(formatLogTimestamp(d.toISOString()).text).toBe('2026-11-04 19:36:17.005');
  });

  it('hands back an unparseable value unchanged', () => {
    expect(formatLogTimestamp('not a date')).toEqual({ text: 'not a date', full: 'not a date' });
  });
});

describe('chart scale', () => {
  it('picks a top gridline that splits into four whole steps', () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(5)).toBe(8);
    expect(niceMax(83)).toBe(100);
    expect(niceMax(50)).toBe(60);
    expect(niceMax(1207)).toBe(1600);
    for (const value of [1, 7, 19, 83, 250, 999, 12000, 47410]) {
      const top = niceMax(value);
      expect(top).toBeGreaterThanOrEqual(value);
      expect(Number.isInteger(top / 4)).toBe(true);
    }
  });

  it('lists gridlines top to bottom, ending at zero', () => {
    expect(yTicks(83)).toEqual([100, 75, 50, 25, 0]);
    expect(yTicks(0)).toEqual([4, 3, 2, 1, 0]);
  });

  it('abbreviates axis numbers', () => {
    expect(formatAxisNumber(950)).toBe('950');
    expect(formatAxisNumber(1200)).toBe('1.2k');
    expect(formatAxisNumber(2000000)).toBe('2M');
  });

  it('spreads x labels evenly, always keeping the first and last bucket', () => {
    expect(xTickIndices(0)).toEqual([]);
    expect(xTickIndices(3)).toEqual([0, 1, 2]);
    expect(xTickIndices(25)).toEqual([0, 6, 12, 18, 24]);
    expect(xTickIndices(100, 3)).toEqual([0, 50, 99]);
  });

  it('shows just the time for short windows and the date too for long ones', () => {
    const ts = new Date(2026, 10, 4, 18, 40).toISOString();
    expect(formatTick(ts, 60 * 60 * 1000)).toBe('18:40');
    expect(formatTick(ts, 24 * 60 * 60 * 1000)).toMatch(/18:40$/);
    expect(formatTick(ts, 24 * 60 * 60 * 1000)).toContain(',');
  });
});

describe('Logs page source', () => {
  const dir = new URL('../src/app/dashboard/logs/', import.meta.url);
  const files = readdirSync(dir).filter((name) => /\.(tsx?|css)$/.test(name));

  it('has no emoji or pictograph characters in any file', () => {
    const emoji = /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2713}\u{2715}]|\u{FE0F})/u;
    const offenders = files.filter((name) => emoji.test(readFileSync(new URL(name, dir), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
