# MedDevKit

**[Live demo →](https://meddevkit.github.io/meddevkit/)** Paste a clinical note and compare MedDevKit's chunks with a generic chunker side by side.

MedDevKit is an open-source medical NLP toolkit that provides PHI-aware text chunking for RAG applications, with local, pattern-based detection of vital signs, clinical sections, negations, and potential protected health information (PHI) in clinical notes. The chunker makes no network calls and takes under 2 ms to chunk a 4K-character synthetic note on an Apple M4 Max laptop (median about 1.3 ms; reproduce with `pnpm --filter @meddevkit/chunker bench`). When it splits text, it avoids cutting inside vital signs and medication mentions and prefers clinical section boundaries.

## Why MedDevKit?

Generic RAG chunkers fail on medical text:
- They split vital signs from their labels or units: `"BP:"` | `"120/80 mmHg"`
- They ignore clinical sections
- They miss PHI risks

**MedDevKit was built for healthcare.**

## Quick Start

```bash
npm install @meddevkit/chunker
```

```typescript
import { MedicalChunker } from '@meddevkit/chunker';

const chunker = new MedicalChunker({
  preserveVitals: true,      // Don't split "BP: 120/80"
  phiDetection: 'basic',     // Flag potential PHI
  maxTokens: 512
});

const result = chunker.chunk(clinicalNote);
// { chunks: MedicalChunk[], metadata: ProcessingMetadata }
```

## Features

### Vital Signs Preservation

Never splits measurements like blood pressure, heart rate, or O2 saturation:

```typescript
// Input: "BP: 120/80 mmHg, HR 72 bpm"
// Will NOT be split into separate chunks
```

### PHI Detection

Flags potential Protected Health Information:

```typescript
const result = chunker.chunk(noteWithPhi);

if (result.metadata.containsPhi) {
  console.log('Warning: PHI detected');
  result.chunks.forEach(chunk => {
    chunk.phiMarkers.forEach(marker => {
      console.log(`${marker.type} at position ${marker.startOffset}`);
    });
  });
}
```

### Clinical Section Awareness

Recognizes and respects standard clinical note sections:

- Chief Complaint (CC)
- History of Present Illness (HPI)
- Physical Examination (PE)
- Assessment & Plan (A/P)
- Medications, Allergies, and more

### Token-Aware Chunking

Respects LLM context limits while preserving medical integrity:

```typescript
const chunker = new MedicalChunker({
  maxTokens: 512,      // Maximum tokens per chunk
  minTokens: 50,       // Minimum tokens per chunk
  overlapTokens: 50,   // Context overlap between chunks
});
```

Each chunk after the first is prefixed with up to `overlapTokens` of the text
that precedes it. The overlap is a contiguous slice of the normalized text that
starts on a word boundary (a sentence or line start when one is available) and
never inside a vital sign, medication, or PHI span. Overlap is added on top of
`maxTokens`, so a chunk's `tokenCount` may exceed `maxTokens` by up to
`overlapTokens`. PHI markers and all other detections in the overlap are
reported on the chunk, and every offset is relative to `chunk.text`.

### Negation Detection

Optionally detect negated medical findings:

```typescript
const chunker = new MedicalChunker({
  detectNegations: true
});

// "Patient denies chest pain" -> { negatedText: "chest pain", type: "denied" }
```

### Medication, Temporal & Severity Detection

Medication mentions (drug + dose) are detected and preserved by default, so
"Metoprolol 25 mg PO BID" is never split across chunks. Temporal expressions
and severity modifiers are opt-in:

```typescript
const chunker = new MedicalChunker({
  preserveMedications: true, // default
  detectTemporal: true,
  detectSeverity: true,
});

const { chunks } = chunker.chunk(
  'Severe chest pain for 3 days. Started metoprolol 25 mg PO BID.'
);

chunks[0].metadata.medications;
// [{ name: 'metoprolol', dose: 25, unit: 'mg', route: 'oral', frequency: 'BID', ... }]
chunks[0].metadata.temporal;
// [{ type: 'duration', raw: 'for 3 days', value: 3, unit: 'day', ... }]
chunks[0].metadata.severity;
// [{ level: 'severe', term: 'Severe', modifiedText: 'chest pain for 3 days', ... }]
```

The detectors are also available standalone: `detectMedications()`,
`detectTemporal()` and `detectSeverity()`. Medication detection is
pattern-based (no drug lexicon) and ignores vitals and lab values such as
"weight 80 kg" or "glucose 180 mg/dL".

### Plugin System

Extend MedDevKit with custom pattern detection via the plugin architecture:

```typescript
import { MedicalChunker } from '@meddevkit/chunker';
import type { PatternPlugin, MedDevKitContext } from '@meddevkit/chunker';

const myPlugin: PatternPlugin = {
  id: '@myorg/medication-plugin',
  name: 'Medication Pattern Plugin',
  version: '1.0.0',
  minContextVersion: '1.0.0',

  detectPatterns(text: string, ctx: MedDevKitContext) {
    const matches = [];
    const regex = /(\w+)\s+(\d+)\s*(mg|mcg|ml)/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        patternId: 'medication-dose',
        patternName: 'Medication Dosage',
        pluginId: '@myorg/medication-plugin',
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        raw: match[0],
        confidence: 0.9,
        isProtected: true, // Prevents splitting on this pattern
        category: 'medication',
        data: {
          medication: match[1],
          dose: parseInt(match[2]),
          unit: match[3],
        },
      });
    }
    return matches;
  },
};

const chunker = new MedicalChunker({
  plugins: [myPlugin],
  includePluginPatterns: true,
});

const result = chunker.chunk('Patient taking aspirin 81 mg daily.');
// result.metadata.pluginsApplied: ['@myorg/medication-plugin']
// result.chunks[0].metadata.pluginPatterns: { '@myorg/medication-plugin': [...] }
```

A plugin is a plain object, so you can ship one in your own npm package.

**Plugin Lifecycle Hooks:**
- `onRegister` — Called when plugin is registered
- `onDocumentStart` — Called before processing begins
- `onPatternsCollected` — Modify all collected patterns
- `onChunkCreated` — Modify individual chunks
- `onDocumentEnd` — Called after processing completes
- `onUnload` — Cleanup when plugin is removed

## Clinical NLP providers (MedicalAnalyzer)

`MedicalAnalyzer` combines the local detectors with a clinical NLP provider (Azure Text Analytics for health, or your own) and returns provider-neutral entities you can feed into the chunker:

- **Local detection** runs first: PHI, sections, vitals, medications, negation.
- **PHI policy** is applied before any text leaves the process (`'mask'` by default, same-length so offsets stay valid).
- **Provider**: the first available adapter in `providers` order is called, with a timeout. If all fail, you get a degraded local-only result.
- **Merge**: the provider owns diagnoses, symptoms, procedures and codes; local owns PHI, sections, parsed vitals and dose/route/frequency. Negation is `'either'` by default, and disagreements are flagged.
- **Chunk with entities**: entities are protected from splitting and attached to chunk metadata.

```typescript
import { MedicalChunker, MedicalAnalyzer } from '@meddevkit/chunker';
import { AzureHealthAdapter } from '@meddevkit/adapter-azure';

const analyzer = new MedicalAnalyzer({
  providers: [
    new AzureHealthAdapter({
      endpoint: process.env.AZURE_LANGUAGE_ENDPOINT!,
      apiKey: process.env.AZURE_LANGUAGE_KEY,
    }),
  ],
});

const analysis = await analyzer.analyze(note);
const result = new MedicalChunker().chunk(analysis.text, { entities: analysis.entities });
```

To add another provider, implement the `MedicalNlpAdapter` interface and pass it in `providers`.

Try it in the [live demo](https://meddevkit.github.io/meddevkit/)'s **Analyzer** view: local detectors merged with Azure Text Analytics for health, replayed from recordings or called live with your own endpoint and key. To record the sample notes, run `pnpm build` and then `pnpm --filter @meddevkit/demo record:azure` with `AZURE_LANGUAGE_ENDPOINT` and `AZURE_LANGUAGE_KEY` set.

> **Note:** PHI masking is regex-based and best-effort. It is not HIPAA de-identification; only send clinical text to a provider under an agreement (such as a BAA) that permits it.

## API Reference

### MedicalChunker

```typescript
interface MedicalChunkerConfig {
  preserveVitals?: boolean;      // Default: true
  phiDetection?: 'none' | 'basic' | 'enhanced';  // Default: 'basic' ('enhanced' currently falls back to 'basic')
  maxTokens?: number;            // Default: 512
  minTokens?: number;            // Default: 50
  overlapTokens?: number;        // Default: 50
  preserveSections?: boolean;    // Default: true
  preserveSentences?: boolean;   // Default: true
  detectNegations?: boolean;     // Default: false
  preserveMedications?: boolean; // Default: true (never split "Metoprolol 25 mg PO BID")
  detectTemporal?: boolean;      // Default: false
  detectSeverity?: boolean;      // Default: false
  customPreservePatterns?: RegExp[];

  // Plugin System
  plugins?: PatternPlugin[];     // Custom pattern plugins
  includePluginPatterns?: boolean;  // Attach patterns to chunks (Default: true)
  strictPluginCompatibility?: boolean;  // Throw on version mismatch (Default: false)
}
```

### PatternPlugin

```typescript
interface PatternPlugin {
  readonly id: string;           // Unique identifier (e.g., '@myorg/plugin-name')
  readonly name: string;         // Human-readable name
  readonly version: string;      // Plugin version (semver)
  readonly minContextVersion: string;  // Minimum MedDevKit Context version

  // Pattern Detection
  detectPatterns?(text: string, ctx: MedDevKitContext): PatternMatch[];
  getProtectedRanges?(text: string, ctx: MedDevKitContext): ProtectedRange[];
  annotateChunk?(chunk: MedicalChunk, ctx: MedDevKitContext): ChunkAnnotations;

  // Lifecycle Hooks
  onRegister?(ctx: MedDevKitContext): void | Promise<void>;
  onDocumentStart?(document: { text: string }, ctx: MedDevKitContext): void;
  onPatternsCollected?(patterns: PatternMatch[], ctx: MedDevKitContext): PatternMatch[];
  onChunkCreated?(chunk: MedicalChunk, ctx: MedDevKitContext): MedicalChunk;
  onDocumentEnd?(result: ChunkingResult, ctx: MedDevKitContext): void;
  onUnload?(): void;
}
```

### MedDevKitContext

The context object passed to plugins with utilities and version information:

```typescript
interface MedDevKitContext {
  readonly brandVersion: string;    // "MedDevKit Context 1.0"
  readonly contextVersion: string;  // "1.0.0" (semver)
  readonly text: string;            // Document text
  readonly features: ContextFeatures;

  // Utilities
  estimateTokens(text: string): number;
  estimateCharsForTokens(tokens: number): number;
  matchPattern(pattern: RegExp): Array<{ match: RegExpExecArray; start: number; end: number }>;
  hasFeature(feature: keyof ContextFeatures): boolean;
  addProtectedRange(start: number, end: number): void;
}
```

### ChunkingResult

```typescript
interface ChunkingResult {
  chunks: MedicalChunk[];
  metadata: ProcessingMetadata;
}

interface MedicalChunk {
  text: string;
  id: string;
  index: number;
  hasPhi: boolean;
  phiMarkers: PhiMarker[];
  boundaries: ChunkBoundary;
  metadata: ChunkMetadata;
}

interface ChunkBoundary {
  start: number;          // Core (non-overlap) range start in the normalized text
  end: number;            // Core range end (exclusive)
  overlapStart?: number;  // Where chunk.text begins when overlap was prepended
  splitReason: SplitReason;
}
```

Offsets in `phiMarkers` and `metadata` (vitals, negations, medications,
temporal, severity, plugin patterns) are relative to `chunk.text`, so
`chunk.text.slice(m.startOffset, m.endOffset)` returns the matched text.

## Limitations

This toolkit provides **basic, regex-based patterns** suited to demos, prototypes and development. PHI detection is best-effort flagging, not HIPAA de-identification, and MedDevKit makes no HIPAA compliance claim. Validate it on your own data before relying on it.

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [@meddevkit/chunker](https://github.com/MedDevKit/meddevkit/tree/main/packages/chunker) | PHI-aware medical text chunker with plugin system | Available |
| [@meddevkit/adapter-azure](https://github.com/MedDevKit/meddevkit/tree/main/packages/adapter-azure) | Azure Text Analytics for health provider adapter | Available |
| [@meddevkit/crisis-signals](https://github.com/MedDevKit/meddevkit/tree/main/packages/crisis-signals) | Keyword-and-context screen that flags first-person crisis language for human follow-up; not a diagnostic or risk-assessment tool, will miss some expressions of risk, never the only safeguard | In development, unreviewed |
| [@meddevkit/crisis-adapter-nope](https://github.com/MedDevKit/meddevkit/tree/main/packages/crisis-adapter-nope) | Opt-in second opinion for crisis-signals from a self-hosted nope-edge model; not a diagnostic or risk-assessment tool, never the only safeguard | In development, unreviewed |

## Development

```bash
# Clone the repository
git clone https://github.com/meddevkit/meddevkit.git
cd meddevkit

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Development mode
pnpm dev
```

## Contributing

Questions and contributions: open a GitHub issue or pull request.

## License

MIT - See [LICENSE](https://github.com/MedDevKit/meddevkit/blob/main/LICENSE)
