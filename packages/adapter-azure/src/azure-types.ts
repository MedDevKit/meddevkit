/**
 * Wire types for the Azure AI Language analyze-text jobs API, limited to
 * what the Healthcare task returns and this adapter reads.
 *
 * Shapes follow the Microsoft Learn REST reference ("Analyze Text Submit
 * Job" / "Analyze Text Job Status"). All fields are treated as optional
 * when read, since the service may omit them.
 *
 * @packageDocumentation
 */

/** Error object returned by the service */
export interface AzureError {
  code?: string;
  message?: string;
  target?: string;
  details?: AzureError[];
  innererror?: AzureError;
}

/** Body of a non-2xx response */
export interface AzureErrorResponse {
  error?: AzureError;
}

/** Job / task state */
export type AzureJobStatus =
  | 'notStarted'
  | 'running'
  | 'succeeded'
  | 'partiallyCompleted'
  | 'failed'
  | 'cancelled'
  | 'cancelling';

/** Assertion attached to a healthcare entity (only non-default values are returned) */
export interface AzureHealthcareAssertion {
  conditionality?: 'hypothetical' | 'conditional';
  certainty?: 'positive' | 'positivePossible' | 'neutralPossible' | 'negativePossible' | 'negative';
  association?: 'subject' | 'other';
  temporality?: string;
}

/** Link from an entity to a UMLS source vocabulary concept */
export interface AzureHealthcareEntityLink {
  dataSource: string;
  id: string;
}

/** A healthcare entity */
export interface AzureHealthcareEntity {
  text: string;
  category: string;
  subcategory?: string;
  offset: number;
  length: number;
  confidenceScore: number;
  assertion?: AzureHealthcareAssertion;
  name?: string;
  links?: AzureHealthcareEntityLink[];
}

/** One participant in a relation */
export interface AzureHealthcareRelationEntity {
  /** JSON pointer, e.g. `#/results/documents/0/entities/1` */
  ref: string;
  role: string;
}

/** A relation between entities of the same document */
export interface AzureHealthcareRelation {
  relationType: string;
  confidenceScore?: number;
  entities: AzureHealthcareRelationEntity[];
}

/** Non-fatal per-document warning */
export interface AzureDocumentWarning {
  code: string;
  message?: string;
  targetRef?: string;
}

/** Per-document result */
export interface AzureHealthcareDocumentResult {
  id: string;
  entities?: AzureHealthcareEntity[];
  relations?: AzureHealthcareRelation[];
  warnings?: AzureDocumentWarning[];
}

/** Per-document error */
export interface AzureDocumentError {
  id: string;
  error?: AzureError;
}

/** Results of the Healthcare task */
export interface AzureHealthcareResults {
  documents?: AzureHealthcareDocumentResult[];
  errors?: AzureDocumentError[];
  modelVersion?: string;
}

/** One task item in a job status response */
export interface AzureTaskItem {
  kind?: string;
  taskName?: string;
  status?: AzureJobStatus;
  results?: AzureHealthcareResults;
}

/** Job status response (GET operation-location) */
export interface AzureJobState {
  jobId?: string;
  status?: AzureJobStatus;
  errors?: AzureError[];
  tasks?: {
    completed?: number;
    failed?: number;
    inProgress?: number;
    total?: number;
    items?: AzureTaskItem[];
  };
}
