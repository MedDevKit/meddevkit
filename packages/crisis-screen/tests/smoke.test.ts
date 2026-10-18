import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { screenText, PATTERNS_VERSION } from '../src';
import type { PatternFile } from '../src';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

describe('package smoke', () => {
  it('flags first-person crisis language and suppresses an idiom', () => {
    expect(screenText('I keep thinking about ending it.').level).toBe('crisis');
    const idiom = screenText('This commute is killing me.');
    expect(idiom.level).toBe('none');
    expect(idiom.findings[0].modifiers.idiom).toBe(true);
    expect(idiom.patternsVersion).toBe(PATTERNS_VERSION);
  });

  it('pattern JSON loads and has a semver version', () => {
    const raw = readFileSync(fileURLToPath(new URL('../data/crisis.patterns.json', import.meta.url)), 'utf8');
    const data = JSON.parse(raw) as PatternFile;
    expect(data.version).toMatch(SEMVER);
    expect(data.patterns.length).toBeGreaterThan(0);
    expect(data.modifiers.length).toBeGreaterThan(0);
    expect(PATTERNS_VERSION).toBe(data.version);
  });
});
