# MedDevKit Capabilities & Architecture

> **Purpose:** Define MedDevKit's core capabilities, positioning, and recommended usage patterns.
>
> **Date:** 2025-01-02
> **Status:** Architecture Definition

---

## Core Identity

**MedDevKit is a browser-native medical text processing library.**

- Zero external dependencies
- Works in browser AND Node.js
- Fast (~50ms for typical clinical notes)
- No API keys required for core functionality

---

## Two Primary Capabilities

### 1. Pattern Detection (Real-Time)

Designed for **immediate feedback** during text input or voice transcription.

| Function | Purpose | Use Case |
|----------|---------|----------|
| `detectNegations()` | Find negated medical findings | Highlight "denies chest pain" as user speaks |
| `detectSections()` | Identify clinical note sections | Show "HPI" header when detected |
| `detectVitals()` | Extract vital sign measurements | Format "BP 120/80" specially in UI |
| `detectPhi()` | Flag potential PHI | Warn before submission |

**Characteristics:**
- Stateless functions
- Operate on any text length
- Return position offsets for UI highlighting
- Confidence scores for each detection

```typescript
// Browser usage - real-time feedback
import { detectNegations, detectSections, detectVitals } from '@meddevkit/chunker';

transcriptionStream.onSegment((segment) => {
  const negations = detectNegations(segment.text);
  const sections = detectSections(segment.text);
  const vitals = detectVitals(segment.text);

  // Update UI immediately
  updateHighlights({ negations, sections, vitals });
});
```

### 2. Chunking (Batch Processing)

Designed for **preparing completed documents** for downstream processing (RAG, LLM, APIs).

| Feature | Purpose |
|---------|---------|
| Token-aware splitting | Respect LLM context limits (~512 tokens default) |
| Section boundary detection | Prefer splitting at "ASSESSMENT:" not mid-sentence |
| Vital sign preservation | Never split "BP: 120/80 mmHg" |
| Overlap support | Configurable token overlap between chunks |

**Characteristics:**
- Operates on complete documents
- Returns array of chunks with metadata
- Preserves medical context across splits

```typescript
// Server usage - prepare for LLM/RAG
import { MedicalChunker } from '@meddevkit/chunker';

const chunker = new MedicalChunker({
  maxTokens: 512,
  preserveVitals: true,
  preserveSections: true
});

const { chunks, metadata } = chunker.chunk(completedTranscription);
// Send chunks to embedding service, LLM, etc.
```

---

## Pattern Inventory

### Negation Patterns (13 patterns, 5 types)

| Type | Confidence | Examples |
|------|------------|----------|
| `ruled_out` | 0.95 | "rule out MI", "r/o PE", "excluded" |
| `absent` | 0.90 | "no chest pain", "absence of", "free of" |
| `negative` | 0.90 | "negative for malignancy", "unremarkable" |
| `denied` | 0.85 | "denies fever", "patient denies" |
| `without` | 0.80 | "without edema", "not associated with" |

### Section Patterns (29 patterns, 16 types)

- Chief Complaint (CC)
- History of Present Illness (HPI)
- Past Medical History (PMH)
- Past Surgical History (PSH)
- Medications
- Allergies
- Family History
- Social History
- Review of Systems (ROS)
- Physical Exam (PE)
- Vitals
- Assessment
- Plan
- Labs
- Imaging
- Procedures

### Vital Sign Patterns (9 types)

| Type | Pattern Examples |
|------|------------------|
| Blood Pressure | "BP: 120/80", "B/P 120/80 mmHg" |
| Heart Rate | "HR: 72", "pulse 72 bpm" |
| Respiratory Rate | "RR: 16", "resp rate 16/min" |
| Temperature | "T: 98.6", "temp 37.0 C" |
| Oxygen Saturation | "O2 sat 98%", "SpO2: 98" |
| Weight | "Wt: 180 lbs", "weight 81.6 kg" |
| Height | "Ht: 5'10\"", "height 178 cm" |
| BMI | "BMI: 24.5" |
| Pain Scale | "pain 7/10" |

### PHI Patterns (18 patterns, 8 types)

| Type | Confidence | Notes |
|------|------------|-------|
| SSN | 0.95 | XXX-XX-XXXX format |
| Email | 0.95 | Standard email pattern |
| MRN | 0.90 | Medical record numbers |
| Age >89 | 0.85 | HIPAA Safe Harbor |
| Phone | 0.80 | US formats |
| Address | 0.70 | Street addresses |
| Date | 0.60 | Many false positives in clinical text |
| Name | 0.50 | Labeled names only |

---

## Usage Contexts

### Browser (Real-Time Voice/Text)

**Primary value: Pattern detection**

```typescript
// Real-time feedback during transcription
import { detectNegations, detectSections, detectVitals, detectPhi } from '@meddevkit/chunker';

function processSegment(text: string) {
  return {
    negations: detectNegations(text),
    sections: detectSections(text),
    vitals: detectVitals(text),
    phi: detectPhi(text),
  };
}
```

### Server/Node.js (Document Processing)

**Primary value: Chunking + Pattern detection**

```typescript
// Prepare document for downstream processing
import { MedicalChunker, detectNegations } from '@meddevkit/chunker';

const chunker = new MedicalChunker({ maxTokens: 512 });
const { chunks } = chunker.chunk(document);

// Each chunk includes detected patterns
chunks.forEach(chunk => {
  console.log(chunk.metadata.section);      // Which section this chunk is from
  console.log(chunk.metadata.vitals);       // Vitals in this chunk
  console.log(chunk.metadata.negations);    // Negations in this chunk
});
```

---

## What MedDevKit Does NOT Do

| Not Included | Why | Alternative |
|--------------|-----|-------------|
| Entity extraction (medications, diagnoses) | Requires ML models or cloud APIs | Azure Text Analytics, AWS Comprehend |
| ICD-10/CPT code mapping | Requires terminology databases | Cloud APIs, custom databases |
| Ontology linking (SNOMED, RxNorm) | Requires external services | Azure/AWS ontology APIs |
| Model inference | Would require heavy dependencies | MedGemma, scispaCy (separate) |

MedDevKit focuses on **pattern-based preprocessing** that works offline, in the browser, with zero dependencies. Cloud services handle entity extraction and ontology linking.

---

## Package Structure

```
@meddevkit/chunker
├── src/
│   ├── MedicalChunker.ts      # Token-aware chunking
│   ├── patterns/
│   │   ├── negation.ts        # 13 negation patterns
│   │   ├── sections.ts        # 29 section patterns
│   │   ├── vitals.ts          # 9 vital sign patterns
│   │   ├── phi.ts             # 18 PHI patterns
│   │   └── index.ts           # Unified exports
│   ├── plugins/
│   │   ├── MedDevKitContextImpl.ts  # Context implementation
│   │   ├── PluginManager.ts   # Plugin lifecycle management
│   │   ├── version.ts         # Version compatibility
│   │   ├── errors.ts          # Plugin error types
│   │   └── index.ts           # Plugin exports
│   ├── tokenizer/
│   │   └── estimator.ts       # Token count estimation
│   ├── utils/
│   │   ├── boundaries.ts      # Split point detection
│   │   └── normalize.ts       # Text normalization
│   ├── types.ts               # Type definitions
│   └── index.ts               # Public API
└── tests/
```

---

## Future Considerations

### Potential Package Split

If the library grows, consider splitting:

```
@meddevkit/patterns    ← Browser-focused, real-time detection
@meddevkit/chunker     ← Server-focused, RAG/LLM preparation
@meddevkit/types       ← Shared type definitions
```

### Optional Cloud Adapters

If demand exists, cloud adapters could be separate packages:

```
@meddevkit/adapter-azure    ← Azure Text Analytics wrapper
@meddevkit/adapter-aws      ← AWS Comprehend wrapper
```

These would be **optional, Node.js-only** packages that don't compromise the browser-native core.

---

## Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|-----------------|-------|
| `detectNegations()` | <5ms | Regex-based |
| `detectSections()` | <5ms | Regex-based |
| `detectVitals()` | <5ms | Regex-based |
| `detectPhi()` | <10ms | Regex-based |
| `chunk()` (1K chars) | <20ms | Includes all pattern detection |
| `chunk()` (10K chars) | <50ms | Scales linearly |

All operations are synchronous and CPU-bound. No network calls, no async required for core functionality.
