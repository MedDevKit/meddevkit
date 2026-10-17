/**
 * ACI-Bench integration tests
 *
 * Runs the chunker and detectors over four unmodified notes from ACI-Bench
 * (Yim et al., 2023, CC BY 4.0). The encounters were role-played, so the
 * notes contain no real patient data. See tests/fixtures/aci-bench/NOTICE.md
 * for source, citation and license.
 *
 * Notes and why they were chosen:
 * - D2N011 (virtassist): ED follow-up for chest pain. Prose-style note, BP
 *   only inside sentences, "•" bullets, "denies ..." in the HPI.
 * - D2N035 (aci): CHF follow-up. VITALS block with BP, temperature, HR and
 *   SpO2; ROS "Denies ..." lines; brand-name meds with doses.
 * - D2N041 (aci): sore throat with hypertension and diabetes. VITALS block,
 *   SOCIAL HISTORY, metformin/lisinopril doses.
 * - D2N062 (aci): GI, difficulty swallowing. "BP:", "SpO2:", "Respiratory
 *   rate:", separate ASSESSMENT and PLAN headers.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MedicalChunker } from '../src/MedicalChunker';
import {
  detectVitals,
  detectSections,
  detectNegations,
  detectMedications,
} from '../src/patterns';
import { normalizeText } from '../src/utils';
import { estimateTokens } from '../src/tokenizer';
import type { MedicalChunk } from '../src/types';

// ============================================================================
// Fixtures and helpers
// ============================================================================

const FIXTURE_DIR = join(__dirname, 'fixtures', 'aci-bench');
const NOTE_IDS = ['D2N011', 'D2N035', 'D2N041', 'D2N062'] as const;
type NoteId = (typeof NOTE_IDS)[number];

function loadNote(id: NoteId): string {
  return readFileSync(join(FIXTURE_DIR, `${id}.txt`), 'utf8');
}

const nonWs = (s: string): string => s.replace(/\s+/g, '');

/** Every position where the chunker cut the (normalized) text */
function cutPositions(chunks: MedicalChunk[]): number[] {
  const cuts: number[] = [];
  for (const chunk of chunks) {
    cuts.push(chunk.boundaries.start, chunk.boundaries.end);
    if (chunk.boundaries.overlapStart !== undefined) {
      cuts.push(chunk.boundaries.overlapStart);
    }
  }
  return cuts;
}

/**
 * Non-whitespace text of each chunk's core (the chunk text minus its
 * overlap prefix), taken from chunk.text itself.
 */
function coreNonWs(normalized: string, chunk: MedicalChunk): string {
  const text = nonWs(chunk.text);
  const { overlapStart, start } = chunk.boundaries;
  if (overlapStart === undefined) return text;
  const overlap = nonWs(normalized.slice(overlapStart, start));
  expect(text.startsWith(overlap)).toBe(true);
  return text.slice(overlap.length);
}

const MAX_TOKENS = [128, 256, 512] as const;

/** 0 = no overlap; 50 = the chunker's default overlapTokens */
const OVERLAP_TOKENS = [0, 50] as const;

// ============================================================================
// Chunking invariants, per note and configuration
// ============================================================================

describe('ACI-Bench notes: chunking invariants', () => {
  for (const id of NOTE_IDS) {
    describe(id, () => {
      const raw = loadNote(id);
      const normalized = normalizeText(raw);
      const vitals = detectVitals(normalized);

      it('fixture loads and contains vitals the detector catches', () => {
        expect(raw.length).toBeGreaterThan(1000);
        expect(vitals.length).toBeGreaterThan(0);
      });

      for (const maxTokens of MAX_TOKENS) {
        for (const overlapTokens of OVERLAP_TOKENS) {
          const label = `maxTokens ${maxTokens}, overlapTokens ${overlapTokens}`;
          const { chunks } = new MedicalChunker({
            maxTokens,
            overlapTokens,
          }).chunk(raw);

          it(`${label}: no vital span crosses a chunk boundary`, () => {
            const split: Array<{ vital: string; cut: number }> = [];
            for (const cut of cutPositions(chunks)) {
              for (const v of vitals) {
                if (cut > v.startOffset && cut < v.endOffset) {
                  split.push({ vital: v.raw, cut });
                }
              }
            }
            expect(split).toEqual([]);
            for (const v of vitals) {
              expect(
                chunks.some((c) => c.text.includes(v.raw)),
                v.raw
              ).toBe(true);
            }
          });

          // D2N062 at maxTokens 128 used to lose [1380, 1654) ("MSK: ..."
          // through "ASSESSMENT\n\nAcute esophagitis."): that range
          // estimates below minTokens and was skipped. It is now merged
          // into the following chunk.
          it(`${label}: chunk cores are contiguous and cover the note in order`, () => {
            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks[0].boundaries.start).toBe(0);
            expect(chunks[chunks.length - 1].boundaries.end).toBe(
              normalized.length
            );
            for (let i = 1; i < chunks.length; i++) {
              expect(chunks[i].boundaries.start, `chunk ${i}`).toBe(
                chunks[i - 1].boundaries.end
              );
            }
            const covered = chunks
              .map((c) => coreNonWs(normalized, c))
              .join('');
            expect(covered).toBe(nonWs(raw));
          });

          // maxTokens bounds a chunk's core. Overlap is added on top of it
          // (documented on MedicalChunkerConfig.maxTokens/overlapTokens and in
          // the README), so the full chunk may reach maxTokens + overlapTokens.
          it(`${label}: every chunk core is within maxTokens (full chunk within maxTokens + overlapTokens)`, () => {
            for (const chunk of chunks) {
              const { start, end } = chunk.boundaries;
              const core = normalized.slice(start, end).trim();
              expect(estimateTokens(core)).toBeLessThanOrEqual(maxTokens);
              expect(estimateTokens(chunk.text)).toBe(
                chunk.metadata.tokenCount
              );
              expect(chunk.metadata.tokenCount).toBeLessThanOrEqual(
                maxTokens + overlapTokens
              );
              if (overlapTokens === 0) {
                expect(chunk.metadata.tokenCount).toBeLessThanOrEqual(
                  maxTokens
                );
              }
            }
          });
        }
      }
    });
  }
});

// ============================================================================
// Specific detections, checked by reading each note
// ============================================================================

function vitalByRaw(text: string, raw: string) {
  return detectVitals(text).find((v) => v.raw === raw);
}

function sectionByHeader(text: string, header: string) {
  return detectSections(text).find((s) => s.header === header);
}

function negationFor(text: string, negatedText: string) {
  return detectNegations(text).find((n) => n.negatedText === negatedText);
}

function medicationByName(text: string, name: string) {
  return detectMedications(text).find((m) => m.name === name);
}

describe('ACI-Bench D2N011 (ED follow-up, chest pain)', () => {
  const text = normalizeText(loadNote('D2N011'));

  it('detects "blood pressure of 180/95" in the assessment prose', () => {
    const bp = vitalByRaw(text, 'blood pressure of 180/95');
    expect(bp?.type).toBe('blood_pressure');
    expect(bp?.value).toBe(180);
    expect(bp?.value2).toBe(95);
  });

  it('maps section headers', () => {
    expect(sectionByHeader(text, 'HISTORY OF PRESENT ILLNESS')?.type).toBe('hpi');
    expect(sectionByHeader(text, 'PHYSICAL EXAMINATION')?.type).toBe(
      'physical_exam'
    );
    expect(sectionByHeader(text, 'ASSESSMENT AND PLAN')?.type).toBe(
      'assessment'
    );
  });

  it('negates "He denies a family history of heart disease"', () => {
    const neg = negationFor(text, 'a family history of heart disease');
    expect(neg?.type).toBe('denied');
  });

  it('finds carvedilol 25 mg twice a day', () => {
    const med = medicationByName(text, 'carvedilol');
    expect(med?.dose).toBe(25);
    expect(med?.unit).toBe('mg');
    expect(med?.raw).toBe('carvedilol 25 mg twice a day');
  });
});

describe('ACI-Bench D2N035 (CHF follow-up)', () => {
  const text = normalizeText(loadNote('D2N035'));

  it('detects the VITALS block values', () => {
    const bp = vitalByRaw(text, 'Blood Pressure: 128/72 mmHg');
    expect(bp?.type).toBe('blood_pressure');
    expect([bp?.value, bp?.value2]).toEqual([128, 72]);

    const hr = vitalByRaw(text, 'Heart Rate: 72 bpm');
    expect(hr?.type).toBe('heart_rate');
    expect(hr?.value).toBe(72);

    const spo2 = vitalByRaw(text, 'Oxygen Saturation: 96%');
    expect(spo2?.type).toBe('oxygen_saturation');
    expect(spo2?.value).toBe(96);
  });

  it('maps section headers', () => {
    expect(sectionByHeader(text, 'CHIEF COMPLAINT')?.type).toBe(
      'chief_complaint'
    );
    expect(sectionByHeader(text, 'REVIEW OF SYSTEMS')?.type).toBe(
      'review_of_systems'
    );
    expect(sectionByHeader(text, 'VITALS')?.type).toBe('vitals');
  });

  it('negates the ROS line "Cardiovascular: Denies chest pain."', () => {
    const neg = negationFor(text, 'chest pain');
    expect(neg?.type).toBe('denied');
    expect(text.slice(neg!.startOffset, neg!.endOffset)).toContain(
      'chest pain'
    );
  });

  it('finds Norvasc 5 mg once daily', () => {
    const med = medicationByName(text, 'Norvasc');
    expect(med?.dose).toBe(5);
    expect(med?.unit).toBe('mg');
    expect(med?.raw).toBe('Norvasc 5 mg once daily');
  });
});

describe('ACI-Bench D2N041 (sore throat, hypertension, diabetes)', () => {
  const text = normalizeText(loadNote('D2N041'));

  it('detects the VITALS block BP and temperature', () => {
    const bp = vitalByRaw(text, 'Blood pressure: 132/80 mm Hg');
    expect(bp?.type).toBe('blood_pressure');
    expect([bp?.value, bp?.value2]).toEqual([132, 80]);

    const temp = vitalByRaw(text, 'Temperature: 100.4 degrees F');
    expect(temp?.type).toBe('temperature');
    expect(temp?.value).toBe(100.4);
  });

  it('maps section headers', () => {
    expect(sectionByHeader(text, 'SOCIAL HISTORY')?.type).toBe(
      'social_history'
    );
    expect(sectionByHeader(text, 'MEDICATIONS')?.type).toBe('medications');
  });

  it('negates "Gastrointestinal: Denies abdominal symptoms."', () => {
    const neg = negationFor(text, 'abdominal symptoms');
    expect(neg?.type).toBe('denied');
  });

  it('finds metformin 1000 mg twice daily', () => {
    const med = medicationByName(text, 'metformin');
    expect(med?.dose).toBe(1000);
    expect(med?.unit).toBe('mg');
    expect(med?.raw).toBe('metformin 1000 mg twice daily');
  });
});

describe('ACI-Bench D2N062 (difficulty swallowing)', () => {
  const text = normalizeText(loadNote('D2N062'));

  it('detects BP, SpO2 and respiratory rate', () => {
    const bp = vitalByRaw(text, 'BP: 133/70');
    expect(bp?.type).toBe('blood_pressure');
    expect([bp?.value, bp?.value2]).toEqual([133, 70]);

    const spo2 = vitalByRaw(text, 'SpO2: 100%');
    expect(spo2?.type).toBe('oxygen_saturation');
    expect(spo2?.value).toBe(100);

    const rr = vitalByRaw(text, 'Respiratory rate: 19');
    expect(rr?.type).toBe('respiratory_rate');
    expect(rr?.value).toBe(19);
  });

  it('maps separate ASSESSMENT and PLAN headers', () => {
    expect(sectionByHeader(text, 'ASSESSMENT')?.type).toBe('assessment');
    expect(sectionByHeader(text, 'PLAN')?.type).toBe('plan');
  });

  it('negates "He denies any weight loss"', () => {
    const neg = negationFor(text, 'any weight loss');
    expect(neg?.type).toBe('denied');
  });

  it('finds Protonix 40 mg', () => {
    const med = medicationByName(text, 'Protonix');
    expect(med?.dose).toBe(40);
    expect(med?.unit).toBe('mg');
  });
});

// ============================================================================
// Known detector gaps exposed by these notes
//
// Each case below states the correct behavior and is marked it.fails because
// the detector does not do it yet. When a detector is fixed, the case starts
// passing, it.fails then reports a failure, and the marker should be removed.
// ============================================================================

describe('ACI-Bench: known detector gaps', () => {
  const d2n011 = normalizeText(loadNote('D2N011'));
  const d2n041 = normalizeText(loadNote('D2N041'));
  const d2n062 = normalizeText(loadNote('D2N062'));

  it('D2N011: detects "blood pressure was noted to be 180/95 mmHg"', () => {
    const bp = detectVitals(d2n011).find(
      (v) => v.type === 'blood_pressure' && v.raw.includes('180/95 mmHg')
    );
    expect(bp).toBeDefined();
  });

  it('D2N041: detects "blood pressure today in office was 132/80 mm Hg"', () => {
    const bps = detectVitals(d2n041).filter(
      (v) => v.type === 'blood_pressure'
    );
    // One in the VITALS block, one in the assessment prose
    expect(bps.length).toBeGreaterThanOrEqual(2);
  });

  it.fails('D2N041: medication name for "prescribe amoxicillin 500 mg" is "amoxicillin"', () => {
    const med = detectMedications(d2n041).find((m) =>
      m.raw.includes('amoxicillin 500 mg')
    );
    expect(med?.name).toBe('amoxicillin');
  });

  it.fails('D2N041: "Rapid COVID-19 test ... is negative" negates the test, not "performed today in office"', () => {
    const neg = detectNegations(d2n041).find((n) => n.type === 'negative');
    expect(neg?.negatedText).toContain('COVID-19 test');
  });

  it.fails('D2N062: "denies dark, tarry stools" negates the whole finding, not just "dark"', () => {
    const negs = detectNegations(d2n062).filter((n) => n.type === 'denied');
    expect(negs.some((n) => n.negatedText.includes('tarry stools'))).toBe(
      true
    );
  });

  it.fails('D2N062: finds "Carafate 1 gram 4 times daily"', () => {
    const med = detectMedications(d2n062).find((m) => m.name === 'Carafate');
    expect(med?.dose).toBe(1);
  });
});
