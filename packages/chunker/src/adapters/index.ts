/**
 * Provider-neutral clinical NLP adapters
 *
 * @packageDocumentation
 */

export type {
  EntityCategory,
  EntityAssertion,
  OntologyCode,
  MedicalEntity,
  EntityRelation,
  AdapterCapabilities,
  AnalyzeOptions,
  AdapterResult,
  CostEstimate,
  MedicalNlpAdapter,
  NegationPolicy,
  MedicalAnalyzerConfig,
  ProviderStatus,
  ProviderOutcome,
  MedicalAnalysisMetadata,
  MedicalAnalysisResult,
} from './types';

export type {
  PhiSpan,
  ProtectedText,
  PhiProtector,
  PhiPolicy,
} from './phi-protection';
export {
  MaskingPhiProtector,
  phiMarkersToSpans,
  normalizePhiSpans,
  buildMask,
} from './phi-protection';

export {
  LocalAdapter,
  extractLocalEntities,
  LOCAL_ADAPTER_NAME,
  LOCAL_ADAPTER_VERSION,
} from './LocalAdapter';

export type { MergeInput, MergeOutput } from './merge';
export {
  mergeEntities,
  remapRelations,
  resolveNegation,
  providerNegationOf,
} from './merge';

export { MedicalAnalyzer } from './MedicalAnalyzer';
