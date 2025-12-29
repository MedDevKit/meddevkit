# MedDevKit

Open-source medical development toolkit for healthcare AI applications.

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
| [@meddevkit/chunker](./packages/chunker) | PHI-aware medical text chunker | Available |
| @meddevkit/terminology | Medical term normalizer | Coming soon |
| @meddevkit/retrieval | Cascading medical retrieval | Coming soon |

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

We welcome contributions! Please see [CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines.

## License

MIT - See [LICENSE](LICENSE)

---

Built with expertise from production healthcare AI systems.
