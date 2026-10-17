import type {
  AdapterCapabilities,
  AdapterResult,
  AnalyzeOptions,
  CostEstimate,
  MedicalNlpAdapter,
} from '@meddevkit/chunker';

/** What a {@link CapturingAdapter} saw on its last analyze() call */
export interface AdapterCapture {
  /** Exact text passed to the wrapped adapter (after PHI policy) */
  sentText?: string;
  /** Raw result returned by the wrapped adapter, when it succeeded */
  result?: AdapterResult;
}

/**
 * Wraps a provider adapter and records the text MedicalAnalyzer passes to
 * analyze() — i.e. what actually leaves the page — plus the raw result.
 * Name, version and capabilities are the wrapped adapter's, so entity
 * sources look the same as without the wrapper.
 */
export class CapturingAdapter implements MedicalNlpAdapter {
  readonly name: string;
  readonly version: string;
  readonly capabilities: AdapterCapabilities;
  readonly capture: AdapterCapture = {};

  constructor(private readonly inner: MedicalNlpAdapter) {
    this.name = inner.name;
    this.version = inner.version;
    this.capabilities = inner.capabilities;
  }

  async analyze(text: string, options?: AnalyzeOptions): Promise<AdapterResult> {
    this.capture.sentText = text;
    this.capture.result = undefined;
    const result = await this.inner.analyze(text, options);
    this.capture.result = result;
    return result;
  }

  isAvailable(): Promise<boolean> {
    return this.inner.isAvailable();
  }

  /** The wrapped adapter's estimate; zero units when it has none */
  estimateCost(text: string): CostEstimate {
    return this.inner.estimateCost?.(text) ?? { units: 0, unitType: 'documents' };
  }
}
