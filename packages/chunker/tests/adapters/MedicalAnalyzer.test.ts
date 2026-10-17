import { describe, it, expect } from 'vitest';
import { MedicalAnalyzer } from '../../src/adapters/MedicalAnalyzer';
import type {
  AdapterCapabilities,
  AdapterResult,
  AnalyzeOptions,
  MedicalEntity,
  MedicalNlpAdapter,
} from '../../src/adapters/types';
import type { PhiProtector, PhiSpan } from '../../src/adapters/phi-protection';
import { normalizeText } from '../../src/utils/normalize';
import { MedicalChunker } from '../../src/MedicalChunker';

// Synthetic note - no real PHI
const NOTE = [
  'Chief Complaint: headache',
  'HPI: Patient denies chest pain. Severe headache for 3 days.',
  'Medications: Lisinopril 10 mg PO daily',
  'Vitals: BP 120/80 mmHg, HR 72 bpm',
  'MRN: 12345678 Phone: 555-867-5309 SSN 078-05-1120',
  'Assessment: migraine',
].join('\n');

const CAPS: AdapterCapabilities = {
  entityExtraction: true,
  negationDetection: true,
  assertionDetection: true,
  relationExtraction: true,
  ontologyLinking: true,
  phiDetection: false,
  offline: false,
  requiresNetwork: true,
};

/**
 * Fake provider: records the text it received and returns entities for
 * every occurrence of the given terms.
 */
class FakeProvider implements MedicalNlpAdapter {
  readonly version = '0.0.1';
  readonly capabilities = CAPS;
  received: string[] = [];
  receivedOptions: (AnalyzeOptions | undefined)[] = [];

  constructor(
    readonly name: string,
    private readonly impl: (text: string, options?: AnalyzeOptions) => Promise<AdapterResult>,
    private readonly available: boolean | (() => Promise<boolean>) = true
  ) {}

  analyze(text: string, options?: AnalyzeOptions): Promise<AdapterResult> {
    this.received.push(text);
    this.receivedOptions.push(options);
    return this.impl(text, options);
  }

  isAvailable(): Promise<boolean> {
    return typeof this.available === 'function' ? this.available() : Promise.resolve(this.available);
  }
}

function entityFor(
  text: string,
  term: string,
  category: MedicalEntity['category'],
  extra: Partial<MedicalEntity> = {}
): MedicalEntity {
  const start = text.indexOf(term);
  if (start < 0) throw new Error(`term not found: ${term}`);
  return {
    text: term,
    category,
    startOffset: start,
    endOffset: start + term.length,
    confidence: 0.9,
    isNegated: false,
    sources: [],
    ...extra,
  };
}

const okProvider = (name = 'fake-health') =>
  new FakeProvider(name, async (text) => ({
    entities: [
      entityFor(text, 'chest pain', 'SymptomOrSign', { assertion: { certainty: 'negative' } }),
      entityFor(text, 'headache', 'SymptomOrSign'),
      entityFor(text, 'Lisinopril', 'MedicationName', {
        normalizedText: 'lisinopril',
        codes: [{ system: 'RXNORM', code: '29046' }],
      }),
      entityFor(text, '10 mg', 'Dosage'),
      entityFor(text, 'migraine', 'Diagnosis', { codes: [{ system: 'ICD10CM', code: 'G43.909' }] }),
    ],
    relations: [
      {
        type: 'DosageOfMedication',
        roles: [
          { role: 'Dosage', entityIndex: 3 },
          { role: 'Medication', entityIndex: 2 },
        ],
        source: '',
      },
    ],
    processingTimeMs: 1,
  }));

const failingProvider = (name = 'failing') =>
  new FakeProvider(name, async () => {
    throw new Error('service returned 503');
  });

const hangingProvider = (name = 'hanging') =>
  new FakeProvider(name, () => new Promise<AdapterResult>(() => undefined));

describe('MedicalAnalyzer', () => {
  describe('local only', () => {
    it('returns local entities with no providers and is not degraded', async () => {
      const result = await new MedicalAnalyzer().analyze(NOTE);

      expect(result.text).toBe(normalizeText(NOTE));
      expect(result.metadata.providers).toEqual([]);
      expect(result.metadata.provider).toBeUndefined();
      expect(result.metadata.degraded).toBe(false);
      expect(result.metadata.phiPolicy).toBe('mask');
      expect(result.metadata.phiSpansProtected).toBe(0);
      expect(result.entities.every((e) => e.sources.includes('meddevkit-local'))).toBe(true);
      expect(result.entities.some((e) => e.category === 'VitalSign')).toBe(true);
      expect(result.sections.map((s) => s.type)).toContain('hpi');
      expect(result.phi.length).toBeGreaterThan(0);
      expect(result.negations.length).toBeGreaterThan(0);
      expect(result.relations).toEqual([]);
    });

    it('offsets refer to the normalized text', async () => {
      const raw = 'HPI:   Severe   headache\r\n\r\n\r\nVitals:  BP 120/80 mmHg  ';
      const result = await new MedicalAnalyzer().analyze(raw);
      for (const e of result.entities) {
        expect(result.text.slice(e.startOffset, e.endOffset)).toBe(e.text);
      }
      expect(result.text).not.toContain('\r');
    });

    it('skips PHI detection when phiDetection is none', async () => {
      const result = await new MedicalAnalyzer({ phiDetection: 'none' }).analyze(NOTE);
      expect(result.phi).toEqual([]);
    });

    it('rejects an invalid timeout', () => {
      expect(() => new MedicalAnalyzer({ timeoutMs: 0 })).toThrow(RangeError);
    });

    it('lines up with MedicalChunker chunk boundaries', async () => {
      const result = await new MedicalAnalyzer().analyze(NOTE);
      const { chunks } = new MedicalChunker({ maxTokens: 30, minTokens: 5, overlapTokens: 0 }).chunk(NOTE);
      const vital = result.entities.find((e) => e.category === 'VitalSign')!;
      const chunk = chunks.find(
        (c) => c.boundaries.start <= vital.startOffset && vital.endOffset <= c.boundaries.end
      );
      expect(chunk).toBeDefined();
      expect(chunk!.text).toContain(vital.text);
    });
  });

  describe('provider success', () => {
    it('merges the provider result', async () => {
      const provider = okProvider();
      const result = await new MedicalAnalyzer({ providers: [provider], phiPolicy: 'send' }).analyze(NOTE);

      expect(result.metadata.provider).toBe('fake-health');
      expect(result.metadata.degraded).toBe(false);
      expect(result.metadata.providers).toEqual([
        { name: 'fake-health', status: 'ok', processingTimeMs: expect.any(Number) },
      ]);

      const diagnosis = result.entities.find((e) => e.category === 'Diagnosis')!;
      expect(diagnosis.text).toBe('migraine');
      expect(diagnosis.sources).toEqual(['fake-health']);
      expect(diagnosis.section).toBe('assessment');

      const med = result.entities.find((e) => e.category === 'MedicationName')!;
      expect(med.text).toBe('Lisinopril');
      expect(med.sources).toEqual(['meddevkit-local', 'fake-health']);
      expect(med.attributes).toMatchObject({ dose: 10, route: 'oral' });
      expect(med.codes).toEqual([{ system: 'RXNORM', code: '29046' }]);

      const chestPain = result.entities.find((e) => e.text === 'chest pain')!;
      expect(chestPain.isNegated).toBe(true);
      expect(chestPain.negation).toEqual({ local: true, provider: true, agreement: true });

      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].source).toBe('fake-health');
      const roles = result.relations[0].roles.map((r) => result.entities[r.entityIndex].category);
      expect(roles).toEqual(['Dosage', 'MedicationName']);

      for (const e of result.entities) {
        expect(result.text.slice(e.startOffset, e.endOffset)).toBe(e.text);
      }
    });

    it('forwards language and a signal to the provider', async () => {
      const provider = okProvider();
      await new MedicalAnalyzer({ providers: [provider] }).analyze(NOTE, { language: 'en' });
      expect(provider.receivedOptions[0]?.language).toBe('en');
      expect(provider.receivedOptions[0]?.signal).toBeDefined();
    });

    it('counts negation disagreements', async () => {
      const provider = new FakeProvider('fake', async (text) => ({
        entities: [entityFor(text, 'chest pain', 'SymptomOrSign', { assertion: { certainty: 'positive' } })],
        processingTimeMs: 1,
      }));
      const result = await new MedicalAnalyzer({ providers: [provider], phiPolicy: 'send' }).analyze(NOTE);
      expect(result.metadata.negationDisagreements).toBe(1);

      const providerPolicy = await new MedicalAnalyzer({
        providers: [provider],
        phiPolicy: 'send',
        negationPolicy: 'provider',
      }).analyze(NOTE);
      expect(providerPolicy.entities.find((e) => e.text === 'chest pain')!.isNegated).toBe(false);
    });

    it('does not negate a provider finding that contains the cue ("no acute distress")', async () => {
      const note = 'Physical Exam: Patient appears in no acute distress.';
      const provider = new FakeProvider('fake', async (text) => ({
        entities: [entityFor(text, 'no acute distress', 'SymptomOrSign')],
        processingTimeMs: 1,
      }));
      const result = await new MedicalAnalyzer({ providers: [provider], phiPolicy: 'send' }).analyze(note);
      const finding = result.entities.find((e) => e.text === 'no acute distress')!;
      expect(finding).toBeDefined();
      expect(finding.isNegated).toBe(false);
      expect(finding.negation).toEqual({ local: false, provider: false, agreement: true });
      expect(result.metadata.negationDisagreements).toBe(0);
    });

    it('drops provider entities with invalid offsets and reports warnings', async () => {
      const provider = new FakeProvider('fake', async (text) => ({
        entities: [
          entityFor(text, 'migraine', 'Diagnosis'),
          { ...entityFor(text, 'headache', 'SymptomOrSign'), startOffset: -1 },
          { ...entityFor(text, 'headache', 'SymptomOrSign'), endOffset: text.length + 10 },
        ],
        relations: [{ type: 't', roles: [{ role: 'a', entityIndex: 0 }, { role: 'b', entityIndex: 1 }], source: 'fake' }],
        warnings: ['model v2 used'],
        processingTimeMs: 1,
      }));
      const result = await new MedicalAnalyzer({ providers: [provider], phiPolicy: 'send' }).analyze(NOTE);
      expect(result.entities.filter((e) => e.sources.includes('fake'))).toHaveLength(1);
      expect(result.relations).toEqual([]);
      expect(result.metadata.warnings).toEqual([
        '2 entities from fake had invalid offsets and were dropped',
        'fake: model v2 used',
      ]);
    });
  });

  describe('cascade', () => {
    it('skips unavailable, records failures, and stops at the first success', async () => {
      const unavailable = okProvider('unavailable');
      const throwingAvailability = new FakeProvider('broken-config', async () => ({ entities: [], processingTimeMs: 0 }), async () => {
        throw new Error('bad config');
      });
      const failing = failingProvider();
      const winner = okProvider('winner');
      const never = okProvider('never-called');
      Object.assign(unavailable, { isAvailable: async () => false });

      const result = await new MedicalAnalyzer({
        providers: [unavailable, throwingAvailability, failing, winner, never],
      }).analyze(NOTE);

      expect(result.metadata.providers.map((p) => [p.name, p.status])).toEqual([
        ['unavailable', 'unavailable'],
        ['broken-config', 'unavailable'],
        ['failing', 'failed'],
        ['winner', 'ok'],
      ]);
      expect(result.metadata.providers[2].reason).toBe('service returned 503');
      expect(result.metadata.provider).toBe('winner');
      expect(result.metadata.degraded).toBe(false);
      expect(unavailable.received).toEqual([]);
      expect(never.received).toEqual([]);
    });

    it('degrades to local-only when every provider fails, without throwing', async () => {
      const invalid = new FakeProvider('invalid', async () => null as unknown as AdapterResult);
      const syncThrow = new FakeProvider('sync-throw', () => {
        throw 'boom';
      });
      const result = await new MedicalAnalyzer({ providers: [failingProvider(), invalid, syncThrow] }).analyze(NOTE);

      expect(result.metadata.degraded).toBe(true);
      expect(result.metadata.provider).toBeUndefined();
      expect(result.metadata.providers.map((p) => p.status)).toEqual(['failed', 'failed', 'failed']);
      expect(result.metadata.providers[1].reason).toBe('adapter returned an invalid result');
      expect(result.metadata.providers[2].reason).toBe('boom');
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities.every((e) => e.sources.length === 1 && e.sources[0] === 'meddevkit-local')).toBe(true);
    });

    it('times out a provider that never resolves and moves on', async () => {
      const hanging = hangingProvider();
      const result = await new MedicalAnalyzer({
        providers: [hanging, okProvider('backup')],
        timeoutMs: 20,
      }).analyze(NOTE);

      expect(result.metadata.providers[0]).toMatchObject({
        name: 'hanging',
        status: 'failed',
        reason: 'timeout after 20ms',
      });
      expect(hanging.receivedOptions[0]?.signal?.aborted).toBe(true);
      expect(result.metadata.provider).toBe('backup');
    });

    it('does not include note text in failure reasons from MedDevKit', async () => {
      const result = await new MedicalAnalyzer({ providers: [hangingProvider()], timeoutMs: 10 }).analyze(NOTE);
      const reasons = result.metadata.providers.map((p) => p.reason ?? '').join(' ');
      expect(reasons).not.toContain('headache');
      expect(reasons).not.toContain('12345678');
    });

    it('truncates long provider error messages', async () => {
      const provider = new FakeProvider('verbose', async () => {
        throw new Error('x'.repeat(500));
      });
      const result = await new MedicalAnalyzer({ providers: [provider] }).analyze(NOTE);
      expect(result.metadata.providers[0].reason!.length).toBeLessThanOrEqual(201);
    });
  });

  describe('PHI policy', () => {
    it("'mask' sends masked text with no raw synthetic PHI and maps offsets back", async () => {
      const provider = okProvider();
      const result = await new MedicalAnalyzer({ providers: [provider] }).analyze(NOTE);
      const sent = provider.received[0];

      expect(sent).toHaveLength(result.text.length);
      expect(sent).not.toContain('12345678');
      expect(sent).not.toContain('555-867-5309');
      expect(sent).not.toContain('078-05-1120');
      expect(sent).toContain('[MRN]');
      expect(result.metadata.phiPolicy).toBe('mask');
      expect(result.metadata.phiSpansProtected).toBeGreaterThanOrEqual(3);

      const diagnosis = result.entities.find((e) => e.category === 'Diagnosis')!;
      expect(result.text.slice(diagnosis.startOffset, diagnosis.endOffset)).toBe('migraine');
    });

    it("'mask' drops provider entities that overlap a placeholder", async () => {
      const provider = new FakeProvider('fake', async (text) => ({
        entities: [entityFor(text, '[MRN]', 'Other'), entityFor(text, 'migraine', 'Diagnosis')],
        relations: [{ type: 't', roles: [{ role: 'a', entityIndex: 0 }, { role: 'b', entityIndex: 1 }], source: 'fake' }],
        processingTimeMs: 1,
      }));
      const result = await new MedicalAnalyzer({ providers: [provider] }).analyze(NOTE);

      expect(result.metadata.droppedMaskedEntities).toBe(1);
      expect(result.entities.some((e) => e.category === 'Other')).toBe(false);
      expect(result.entities.some((e) => e.category === 'Diagnosis')).toBe(true);
      expect(result.relations).toEqual([]);
    });

    it("'send' sends the normalized text unchanged", async () => {
      const provider = okProvider();
      const result = await new MedicalAnalyzer({ providers: [provider], phiPolicy: 'send' }).analyze(NOTE);
      expect(provider.received[0]).toBe(result.text);
      expect(result.metadata.phiSpansProtected).toBe(0);
      expect(result.metadata.phiPolicy).toBe('send');
    });

    it("'block' skips providers when PHI is detected", async () => {
      const provider = okProvider();
      const result = await new MedicalAnalyzer({ providers: [provider], phiPolicy: 'block' }).analyze(NOTE);

      expect(provider.received).toEqual([]);
      expect(result.metadata.providers).toEqual([
        { name: 'fake-health', status: 'skipped', reason: 'phi-blocked' },
      ]);
      expect(result.metadata.degraded).toBe(true);
    });

    it("'block' sends raw text when no PHI is detected", async () => {
      const provider = okProvider();
      const clean = 'HPI: Patient denies chest pain. Severe headache.\nMedications: Lisinopril 10 mg PO daily\nAssessment: migraine';
      const result = await new MedicalAnalyzer({ providers: [provider], phiPolicy: 'block' }).analyze(clean);

      expect(provider.received).toEqual([result.text]);
      expect(result.metadata.provider).toBe('fake-health');
    });

    it('uses a custom protector with a non-identity offset map', async () => {
      // Replaces each PHI span with a short token "#n" (variable length)
      const vault: PhiProtector = {
        name: 'test-vault',
        async protect(text: string, phi: PhiSpan[]) {
          const spans = [...phi].sort((a, b) => a.startOffset - b.startOffset);
          let out = '';
          let cursor = 0;
          const pieces: { protStart: number; origStart: number; protLen: number; origLen: number }[] = [];
          const protectedSpans: { start: number; end: number }[] = [];
          spans.forEach((s, i) => {
            out += text.slice(cursor, s.startOffset);
            const token = `#${i}`;
            pieces.push({ protStart: out.length, origStart: s.startOffset, protLen: token.length, origLen: s.endOffset - s.startOffset });
            protectedSpans.push({ start: out.length, end: out.length + token.length });
            out += token;
            cursor = s.endOffset;
          });
          out += text.slice(cursor);
          return {
            text: out,
            protectedSpans,
            toOriginalOffset(offset: number) {
              let delta = 0;
              for (const p of pieces) {
                if (offset >= p.protStart + p.protLen) delta += p.origLen - p.protLen;
              }
              return offset + delta;
            },
          };
        },
      };
      const provider = new FakeProvider('fake', async (text) => ({
        entities: [entityFor(text, 'migraine', 'Diagnosis')],
        processingTimeMs: 1,
      }));
      const result = await new MedicalAnalyzer({ providers: [provider], phiPolicy: vault }).analyze(NOTE);

      expect(provider.received[0]).not.toContain('12345678');
      expect(provider.received[0].length).toBeLessThan(result.text.length);
      expect(result.metadata.phiPolicy).toBe('test-vault');
      const diagnosis = result.entities.find((e) => e.category === 'Diagnosis')!;
      expect(diagnosis.text).toBe('migraine');
      expect(result.text.slice(diagnosis.startOffset, diagnosis.endOffset)).toBe('migraine');
    });

    it('never sends unprotected text when the protector fails', async () => {
      const broken: PhiProtector = {
        name: 'broken',
        protect: async () => {
          throw new Error('vault unreachable');
        },
      };
      const a = okProvider('a');
      const b = okProvider('b');
      const result = await new MedicalAnalyzer({ providers: [a, b], phiPolicy: broken }).analyze(NOTE);

      expect(a.received).toEqual([]);
      expect(b.received).toEqual([]);
      expect(result.metadata.providers).toEqual([
        { name: 'a', status: 'skipped', reason: 'phi-protection-failed' },
        { name: 'b', status: 'skipped', reason: 'phi-protection-failed' },
      ]);
      expect(result.metadata.degraded).toBe(true);
    });
  });

  describe('caller abort', () => {
    it('rejects when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(new MedicalAnalyzer().analyze(NOTE, { signal: controller.signal })).rejects.toThrow();
    });

    it('rejects when the caller aborts during a provider call', async () => {
      const controller = new AbortController();
      const hanging = hangingProvider();
      const backup = okProvider('backup');
      const pending = new MedicalAnalyzer({ providers: [hanging, backup], timeoutMs: 10_000 }).analyze(NOTE, {
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(new Error('user cancelled')), 10);

      await expect(pending).rejects.toThrow('user cancelled');
      expect(hanging.receivedOptions[0]?.signal?.aborted).toBe(true);
      expect(backup.received).toEqual([]);
    });

    it('rejects when the provider throws because the caller aborted', async () => {
      const controller = new AbortController();
      const provider = new FakeProvider('abort-aware', async () => {
        controller.abort();
        throw new Error('aborted by signal');
      });
      await expect(
        new MedicalAnalyzer({ providers: [provider] }).analyze(NOTE, { signal: controller.signal })
      ).rejects.toThrow();
    });
  });
});
