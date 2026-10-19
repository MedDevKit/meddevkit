/**
 * @meddevkit/crisis-adapter-nope
 *
 * Opt-in second opinion for `@meddevkit/crisis-signals` from a self-hosted
 * nope-edge model on any OpenAI-compatible chat-completions server.
 * fetch-only: no SDK, no runtime dependencies. Unreviewed; never the only
 * safeguard. See README.md.
 *
 * @packageDocumentation
 */

export {
  NopeEdgeAdapter,
  NOPE_EDGE_ADAPTER_NAME,
  DEFAULT_REQUEST_TIMEOUT_MS,
  retryHeaderMs,
} from './NopeEdgeAdapter';
export type { NopeEdgeAdapterConfig } from './NopeEdgeAdapter';
export { NopeEdgeError } from './errors';
export type { NopeEdgeErrorCode } from './errors';
export { parseNopeOutput, NOPE_RISK_TYPES, MAX_OUTPUT_CHARS } from './parse';
export type { NopeRisk, NopeRiskType, NopeSubject, NopeSeverity, NopeImminence } from './parse';
export { mapNopeRisks, riskLevel, riskImmediacy } from './mapping';
export {
  buildNopeMessages,
  NOPE_EDGE_SYSTEM_PROMPT,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
} from './prompt';
export type { ChatMessage } from './prompt';
export { ADAPTER_VERSION } from './version';
