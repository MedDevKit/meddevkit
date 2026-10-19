/**
 * Error type for the nope-edge adapter.
 *
 * Privacy (SPEC §9): every message is a fixed string, plus at most an HTTP
 * status code, an attempt count, a configured number or a short system
 * error code such as `ECONNREFUSED`. Messages never contain the input text,
 * the server's response body or the model's output (its reflection can
 * quote the input). No `cause` is attached, because a foreign error object
 * could carry any of those.
 */

/** Machine-readable reason for a {@link NopeEdgeError}. */
export type NopeEdgeErrorCode =
  /** The adapter configuration is invalid (thrown by the constructor). */
  | 'InvalidConfig'
  /** `assess` was called with something other than a string. */
  | 'InvalidInput'
  /** No `fetch` implementation is available. */
  | 'NoFetch'
  /** The server answered with a non-2xx status (see `status`). */
  | 'HttpError'
  /** The request failed without an HTTP response (connection refused, reset, DNS, ...). */
  | 'NetworkError'
  /** No complete response within `requestTimeoutMs`. */
  | 'Timeout'
  /** The request was aborted by something other than the caller's signal. */
  | 'Aborted'
  /** The response body is not an OpenAI-compatible chat completion. */
  | 'InvalidResponse'
  /** The chat completion has no message content. */
  | 'EmptyResponse'
  /** The model's output is not the documented `<risks>` XML. */
  | 'ParseError';

/**
 * Error thrown by {@link NopeEdgeAdapter}. The message is fixed text and
 * never contains input text, a response body or model output.
 */
export class NopeEdgeError extends Error {
  /** Machine-readable reason. */
  readonly code: NopeEdgeErrorCode;
  /** HTTP status, when the error came from a non-2xx response. */
  readonly status?: number;

  constructor(message: string, code: NopeEdgeErrorCode, status?: number) {
    super(message);
    this.name = 'NopeEdgeError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}
