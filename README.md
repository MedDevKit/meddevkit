# MedDevKit

MedDevKit is an open-source medical NLP toolkit that provides PHI-aware text chunking for RAG applications, real-time detection of vital signs, clinical sections, negations, and protected health information (PHI) in clinical documentation. Designed for healthcare AI applications with ~50ms latency and no network calls, it enables safe processing of medical text while preserving clinical context boundaries.

## Why MedDevKit?

Generic RAG chunkers fail on medical text:
- They split vital signs: `"BP: 120"` | `"/80 mmHg"`
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

### Negation Detection

Optionally detect negated medical findings:

```typescript
const chunker = new MedicalChunker({
  detectNegations: true
});

// "Patient denies chest pain" -> { negatedText: "chest pain", type: "denied" }
```

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

Plugins can be published to npm as `@meddevkit/plugin-*` packages for community sharing.

**Plugin Lifecycle Hooks:**
- `onRegister` — Called when plugin is registered
- `onDocumentStart` — Called before processing begins
- `onPatternsCollected` — Modify all collected patterns
- `onChunkCreated` — Modify individual chunks
- `onDocumentEnd` — Called after processing completes
- `onUnload` — Cleanup when plugin is removed

## API Reference

### MedicalChunker

```typescript
interface MedicalChunkerConfig {
  preserveVitals?: boolean;      // Default: true
  phiDetection?: 'none' | 'basic' | 'enhanced';  // Default: 'basic'
  maxTokens?: number;            // Default: 512
  minTokens?: number;            // Default: 50
  overlapTokens?: number;        // Default: 50
  preserveSections?: boolean;    // Default: true
  preserveSentences?: boolean;   // Default: true
  detectNegations?: boolean;     // Default: false
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
```

## Production Ready?

This toolkit provides **basic patterns** ideal for demos and development.

For production healthcare deployments requiring:
- HIPAA-compliant PHI handling
- Enhanced pattern detection (50+ patterns)
- BAA coverage
- Enterprise support

Contact us about **MedDevKit Cloud** or consulting services.

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [@meddevkit/chunker](./packages/chunker) | PHI-aware medical text chunker with plugin system | Available |
| @meddevkit/terminology | Medical term normalizer | Coming soon |
| @meddevkit/retrieval | Cascading medical retrieval | Coming soon |

Community plugins follow the `@meddevkit/plugin-*` naming convention.

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

We welcome contributions! Please open an issue or pull request on GitHub.

## License

MIT - See [LICENSE](LICENSE)

---

Built with expertise from production healthcare AI systems. Powered by MedDevKit Context 1.0.
