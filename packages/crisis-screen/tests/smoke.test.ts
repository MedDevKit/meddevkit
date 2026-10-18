import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { screenText, PATTERNS_VERSION } from '../src';
import type { PatternFile } from '../src';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

describe('scaffold smoke', () => {
  it('stub returns none with no findings', () => {
    const r = screenText('This commute is killing me.');
    expect(r).toEqual({ level: 'none', immediacy: false, findings: [], patternsVersion: PATTERNS_VERSION });
  });

  it('pattern JSON loads and has a semver version', () => {
    const raw = readFileSync(fileURLToPath(new URL('../data/crisis.patterns.json', import.meta.url)), 'utf8');
    const data = JSON.parse(raw) as PatternFile;
    expect(data.version).toMatch(SEMVER);
    expect(Array.isArray(data.patterns)).toBe(true);
    expect(Array.isArray(data.modifiers)).toBe(true);
    expect(PATTERNS_VERSION).toBe(data.version);
  });
});
