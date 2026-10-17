# @meddevkit/chunker

## 0.3.0

### Minor Changes

- Add a provider-neutral adapter layer: the `MedicalNlpAdapter` interface and
  the `MedicalEntity` shape, plus `LocalAdapter` (the built-in detectors as an
  adapter that never sends text off the machine).
- Add `MedicalAnalyzer`: runs local detection, applies a PHI policy (default
  `'mask'`), calls the first available provider in order (with a timeout),
  and merges provider and local results. Negation policy defaults to
  `'either'`. If every provider fails, it falls back to a degraded local-only
  result and reports why in `metadata.providers`.
- Add the `PhiProtector` interface and `MaskingPhiProtector`, which masks PHI
  with same-length replacements so offsets stay valid.
- `chunk(text, { entities })`: entities up to 100 characters are protected
  from splitting and attached to chunk metadata with chunk-relative offsets.
  `ProtectedRange` gains the reason `'entity'`.
- Note: the built-in PHI masking is regex-based and best-effort. It is not
  HIPAA de-identification.

## 0.2.1

### Patch Changes

- Show the README on npm (0.2.0 shipped the file, but the npm page had none).
- npm "Homepage" now links to the live demo: https://meddevkit.github.io/meddevkit/
- Published from GitHub Actions via npm trusted publishing, with provenance.

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
