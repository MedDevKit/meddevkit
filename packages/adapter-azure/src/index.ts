/**
 * @meddevkit/adapter-azure
 *
 * Azure AI Language "Text Analytics for health" adapter for MedDevKit's
 * MedicalAnalyzer. fetch-only: no Azure SDK, no runtime dependencies.
 *
 * @packageDocumentation
 */

export {
  AzureHealthAdapter,
  AzureHealthError,
  AZURE_HEALTH_ADAPTER_NAME,
  AZURE_MAX_DOCUMENT_LENGTH,
  AZURE_MAX_DOCUMENTS_PER_JOB,
  AZURE_MAX_CHARS_PER_JOB,
  retryAfterMs,
} from './AzureHealthAdapter';
export type { AzureHealthAdapterConfig } from './AzureHealthAdapter';
export { AZURE_CATEGORY_MAP, mapAzureCategory, mapAzureEntity, parseEntityRef } from './mapping';
export { splitText, batchSegments } from './split';
export type { TextSegment } from './split';
export { ADAPTER_VERSION } from './version';
export type * from './azure-types';
