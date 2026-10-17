/**
 * Provider-neutral clinical NLP adapter types
 *
 * Any clinical NLP engine (MedDevKit's own regex detectors, a cloud
 * service such as Azure Text Analytics for Health, a local model, ...) can
 * be wrapped in a {@link MedicalNlpAdapter} so that results share one
 * entity model. {@link MedicalAnalyzer} runs the local detectors plus an
 * optional provider cascade and merges the results.
 *
 * @packageDocumentation
 */

import type {
  ClinicalSection,
  ClinicalSectionType,
  NegationContext,
  PhiMarker,
} from '../types';
import type { PhiPolicy } from './phi-protection';

// ============================================================================
// Entities
// ============================================================================

/**
 * Provider-neutral entity category.
 *
 * Modeled on the categories common to clinical NLP services; providers map
 * their native category onto one of these and keep the native name in
 * {@link MedicalEntity.providerCategory}. Use `'Other'` for anything that
 * does not fit.
 */
export type EntityCategory =
  | 'Diagnosis'
  | 'SymptomOrSign'
  | 'MedicationName'
  | 'Dosage'
  | 'MedicationRoute'
  | 'MedicationFrequency'
  | 'MedicationForm'
  | 'BodyStructure'
  | 'ProcedureName'
  | 'TestName'
  | 'MeasurementValue'
  | 'VitalSign'
  | 'Time'
  | 'Severity'
  | 'Allergen'
  | 'Other';

/**
 * Assertion (certainty / conditionality / association) attached to an
 * entity by providers that support assertion detection.
 */
export interface EntityAssertion {
  /**
   * How certain the note is about the finding. `'negative'` and
   * `'negativePossible'` are treated as negation by {@link MedicalAnalyzer}.
   */
  certainty?:
    | 'positive'
    | 'positivePossible'
    | 'neutralPossible'
    | 'negativePossible'
    | 'negative';

  /**
   * Whether the finding is hypothetical ("if chest pain returns") or
   * conditional ("pain with exertion").
   */
  conditionality?: 'hypothetical' | 'conditional';

  /**
   * Who the finding is about. `'other'` means someone other than the
   * patient, e.g. a family member ("mother had breast cancer").
   */
  association?: 'subject' | 'other';
}

/**
 * A link from an entity to a concept in a clinical terminology.
 */
export interface OntologyCode {
  /**
   * Terminology / coding system, e.g. `'ICD10CM'`, `'SNOMEDCT_US'`,
   * `'RXNORM'`, `'UMLS'`.
   */
  system: string;

  /**
   * Concept code within the system
   */
  code: string;

  /**
   * Human-readable concept name, if the provider returns one
   */
  name?: string;
}

/**
 * A clinical entity found in text, in a provider-neutral shape.
 */
export interface MedicalEntity {
  /**
   * The entity text as it appears in the analyzed text
   * (`text.slice(startOffset, endOffset)`)
   */
  text: string;

  /**
   * Provider-neutral category
   */
  category: EntityCategory;

  /**
   * The provider's native category name, when it differs from or refines
   * `category`
   */
  providerCategory?: string;

  /**
   * Start offset (inclusive). Adapters return offsets relative to the text
   * they were given; {@link MedicalAnalyzer} results are relative to the
   * normalized text (`MedicalAnalysisResult.text`).
   */
  startOffset: number;

  /**
   * End offset (exclusive), same coordinate space as `startOffset`
   */
  endOffset: number;

  /**
   * Detection confidence (0-1)
   */
  confidence: number;

  /**
   * Whether the finding is negated ("denies chest pain"). In analyzer
   * results this is resolved from local and provider negation according
   * to the configured negation policy.
   */
  isNegated: boolean;

  /**
   * Where the negation decision came from.
   * - `local`: overlaps a MedDevKit negation span
   * - `provider`: provider assertion says negative (absent when the entity
   *   has no provider data)
   * - `agreement`: true when there is no provider opinion or both agree
   */
  negation?: { local?: boolean; provider?: boolean; agreement: boolean };

  /**
   * Provider assertion (certainty, conditionality, association)
   */
  assertion?: EntityAssertion;

  /**
   * Terminology links (ICD-10, SNOMED CT, RxNorm, UMLS, ...)
   */
  codes?: OntologyCode[];

  /**
   * Provider-normalized / canonical name of the concept
   */
  normalizedText?: string;

  /**
   * Clinical section containing the entity start, from local section
   * detection
   */
  section?: ClinicalSectionType;

  /**
   * Names of the adapters that produced or confirmed this entity,
   * e.g. `['meddevkit-local', 'azure-health']`
   */
  sources: string[];

  /**
   * Structured attributes, e.g. dose/route/frequency for medications or
   * parsed values for vital signs
   */
  attributes?: Record<string, unknown>;
}

/**
 * A relation between entities (e.g. medication → dosage), as returned by
 * providers that support relation extraction.
 */
export interface EntityRelation {
  /**
   * Relation type in the provider's vocabulary, e.g. `'DosageOfMedication'`
   */
  type: string;

  /**
   * Participating entities. `entityIndex` indexes into the `entities` array
   * of the result the relation belongs to.
   */
  roles: { role: string; entityIndex: number }[];

  /**
   * Relation confidence (0-1), if provided
   */
  confidence?: number;

  /**
   * Name of the adapter that produced the relation
   */
  source: string;
}

// ============================================================================
// Adapter contract
// ============================================================================

/**
 * What an adapter can do. Used for routing decisions and documentation;
 * {@link MedicalAnalyzer} does not require any particular capability.
 */
export interface AdapterCapabilities {
  /** Statistical / ML entity extraction (not just patterns) */
  entityExtraction: boolean;
  /** Detects negated findings */
  negationDetection: boolean;
  /** Returns certainty / conditionality / association */
  assertionDetection: boolean;
  /** Returns relations between entities */
  relationExtraction: boolean;
  /** Links entities to terminology codes */
  ontologyLinking: boolean;
  /** Detects PHI itself */
  phiDetection: boolean;
  /** Runs without sending text off the machine */
  offline: boolean;
  /** Needs network access to analyze */
  requiresNetwork: boolean;
  /** Maximum document length in characters the adapter accepts, if limited */
  maxDocumentLength?: number;
}

/**
 * Per-call options passed to {@link MedicalNlpAdapter.analyze}.
 */
export interface AnalyzeOptions {
  /**
   * Abort signal. Adapters should stop work and reject when it aborts.
   */
  signal?: AbortSignal;

  /**
   * Document language (BCP-47, e.g. `'en'`), if the adapter needs it
   */
  language?: string;
}

/**
 * Result returned by an adapter.
 */
export interface AdapterResult {
  /**
   * Entities, with offsets relative to the text the adapter was given
   */
  entities: MedicalEntity[];

  /**
   * Relations, with `entityIndex` pointing into `entities`
   */
  relations?: EntityRelation[];

  /**
   * Time the adapter spent, in milliseconds
   */
  processingTimeMs: number;

  /**
   * Non-fatal warnings. Must never contain note text.
   */
  warnings?: string[];

  /**
   * Adapter-specific metadata (model version, request id, ...)
   */
  metadata?: Record<string, unknown>;
}

/**
 * Rough cost estimate for analyzing a text with an adapter.
 */
export interface CostEstimate {
  /** Number of billable units */
  units: number;
  /** What a unit is, e.g. `'documents'`, `'text-records'`, `'characters'` */
  unitType: string;
  /** Estimated cost, if the adapter knows its pricing */
  estimatedCost?: number;
  /** ISO 4217 currency of `estimatedCost`, e.g. `'USD'` */
  currency?: string;
}

/**
 * Common interface for clinical NLP engines.
 *
 * Implementations must:
 * - return entity offsets relative to the text passed to `analyze`
 * - honor `options.signal`
 * - never put note text in error messages or warnings
 */
export interface MedicalNlpAdapter {
  /** Stable adapter name, used in `MedicalEntity.sources` */
  readonly name: string;
  /** Adapter version */
  readonly version: string;
  /** What the adapter can do */
  readonly capabilities: AdapterCapabilities;

  /**
   * Analyze text and return entities.
   */
  analyze(text: string, options?: AnalyzeOptions): Promise<AdapterResult>;

  /**
   * Whether the adapter is configured and usable (credentials present,
   * etc.). Must be cheap and must not require network access.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Optional cost estimate for analyzing `text`.
   */
  estimateCost?(text: string): CostEstimate;
}

// ============================================================================
// Analyzer
// ============================================================================

/**
 * How the final `isNegated` is resolved from local and provider negation.
 * - `'either'`: negated if either side says so (default; safest for
 *   retrieval, since a missed negation is worse than an extra one)
 * - `'provider'`: provider opinion when present, else local
 * - `'local'`: local negation detection only
 */
export type NegationPolicy = 'either' | 'provider' | 'local';

/**
 * Configuration for {@link MedicalAnalyzer}.
 */
export interface MedicalAnalyzerConfig {
  /**
   * Provider adapters, tried in order (cascade): the first one that is
   * available and succeeds wins; later providers are not called.
   * @default []
   */
  providers?: MedicalNlpAdapter[];

  /**
   * What to do with detected PHI before text is sent to a provider.
   * See {@link PhiPolicy}.
   * @default 'mask'
   */
  phiPolicy?: PhiPolicy;

  /**
   * PHI detection mode used for masking/blocking and for `result.phi`.
   * With `'none'`, nothing is masked and `'block'` never blocks.
   * @default 'basic'
   */
  phiDetection?: 'basic' | 'none';

  /**
   * How local and provider negation are combined.
   * @default 'either'
   */
  negationPolicy?: NegationPolicy;

  /**
   * Timeout per provider call, in milliseconds. Combined with the caller's
   * abort signal.
   * @default 30000
   */
  timeoutMs?: number;
}

/**
 * Outcome of one provider in the cascade.
 * - `'ok'`: called and succeeded (its result was merged)
 * - `'failed'`: called and threw / timed out
 * - `'unavailable'`: `isAvailable()` returned false (or threw)
 * - `'skipped'`: not called (PHI policy blocked it, or PHI protection failed)
 */
export type ProviderStatus = 'ok' | 'failed' | 'unavailable' | 'skipped';

/**
 * Status entry for one configured provider.
 */
export interface ProviderOutcome {
  /** Adapter name */
  name: string;
  /** Outcome */
  status: ProviderStatus;
  /** Why it failed or was skipped. Never contains note text from MedDevKit. */
  reason?: string;
  /** Wall-clock time spent calling the provider */
  processingTimeMs?: number;
}

/**
 * Metadata describing how an analysis was produced.
 */
export interface MedicalAnalysisMetadata {
  /** One entry per configured provider, in cascade order (providers after the winner are omitted) */
  providers: ProviderOutcome[];
  /** Name of the provider whose result was merged, if any */
  provider?: string;
  /** True if providers were configured but none succeeded */
  degraded: boolean;
  /** `'mask'`, `'send'`, `'block'`, or the custom protector's name */
  phiPolicy: string;
  /** Number of PHI spans replaced before sending text to the provider */
  phiSpansProtected: number;
  /** Provider entities dropped because they overlapped a PHI placeholder */
  droppedMaskedEntities: number;
  /** Final entities where local and provider negation disagree */
  negationDisagreements: number;
  /** Total analysis time in milliseconds */
  processingTimeMs: number;
  /**
   * Non-fatal warnings (provider warnings, provider entities dropped for
   * invalid offsets). Never contains note text from MedDevKit.
   */
  warnings?: string[];
}

/**
 * Result of {@link MedicalAnalyzer.analyze}. All offsets are relative to
 * `text`, the normalized input (the same normalization MedicalChunker
 * applies).
 */
export interface MedicalAnalysisResult {
  /** Normalized text all offsets refer to */
  text: string;
  /** Merged entities, sorted by startOffset then endOffset */
  entities: MedicalEntity[];
  /** Provider relations, re-indexed into `entities` */
  relations: EntityRelation[];
  /** Locally detected clinical sections */
  sections: ClinicalSection[];
  /** Locally detected PHI (empty when phiDetection is 'none') */
  phi: PhiMarker[];
  /** Locally detected negation spans */
  negations: NegationContext[];
  /** How the result was produced */
  metadata: MedicalAnalysisMetadata;
}
