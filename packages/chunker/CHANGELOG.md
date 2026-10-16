# @meddevkit/chunker

## 0.2.0

### Minor Changes

- Add medication, temporal and severity detection: `detectMedications()`,
  `detectTemporal()` and `detectSeverity()`, plus the `preserveMedications`,
  `detectTemporal` and `detectSeverity` chunker options. Chunks carry
  `metadata.medications`, `metadata.temporal` and `metadata.severity`, and
  `result.metadata` reports `medicationsDetected`, `temporalDetected` and
  `severityDetected`.
- `preserveMedications` defaults to `true`, so doses such as
  "Metoprolol 25 mg PO BID" are never split across chunks.

### Patch Changes

- Fix: chunk offsets and PHI markers are now aligned with `chunk.text` when
  overlap is enabled (`overlapTokens > 0`, the default), and detections inside
  the overlap text are included. `ChunkBoundary.overlapStart` records where
  `chunk.text` begins. Note: summing per-chunk counts now counts items in the
  overlap twice; use the `result.metadata` counts (`vitalsDetected`,
  `medicationsDetected`, ...) instead.
- Fix: negation spans no longer cross line breaks.
- Chore: add ESLint config and a CI workflow, and finish the MedDevKit rebrand
  (remaining OpenMedRAG references).

## 0.1.2

### Patch Changes

- Add the MedDevKit Context 1.0 plugin system (`PatternPlugin`, lifecycle
  hooks, `PluginManager`).
- Improve vital sign detection for natural language variations ("120 over 80",
  "heart rate of 72", "respirations", "temperature of 98.6", "98 percent",
  "weighs").
- Add conversational name patterns to PHI detection ("patient's name is ...",
  "Mr./Mrs./Ms. ...").

## 0.1.0

### Initial Release

- PHI-aware medical text chunker for RAG applications: vital sign
  preservation, clinical section detection, basic PHI marker detection,
  token-aware chunking with overlap, and negation detection.
