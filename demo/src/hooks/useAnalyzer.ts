import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MedicalAnalyzer,
  type AdapterResult,
  type MedicalAnalysisResult,
  type NegationPolicy,
} from '@meddevkit/chunker';
import { AzureHealthAdapter } from '@meddevkit/adapter-azure';
import { CapturingAdapter } from '../utils/capturingAdapter';
import { ReplayAdapter } from '../utils/replayAdapter';
import { AZURE_RECORDINGS } from '../data/recordings';

export type AnalyzerProvider = 'local' | 'recorded' | 'live';
export type DemoPhiPolicy = 'mask' | 'send' | 'block';

export interface AnalyzerSettings {
  provider: AnalyzerProvider;
  /** Live mode only. Kept in React state only; never persisted. */
  endpoint: string;
  /** Live mode only. Kept in React state only; never persisted or logged. */
  apiKey: string;
  phiPolicy: DemoPhiPolicy;
  negationPolicy: NegationPolicy;
}

export interface AnalyzerRun {
  analysis: MedicalAnalysisResult;
  /** Provider mode the run used */
  mode: AnalyzerProvider;
  /** Text passed to the provider; undefined when nothing was sent */
  sentText?: string;
  /** Raw provider result (for metadata such as retries) */
  providerResult?: AdapterResult;
}

export interface AnalyzerOutput {
  run: AnalyzerRun | null;
  loading: boolean;
  /** Error message (never contains the API key) */
  error: string | null;
  /** True when Analyze can be clicked (live mode with endpoint + key) */
  canAnalyze: boolean;
  /** Trigger a live run (no-op outside live mode) */
  analyze: () => void;
}

const DEBOUNCE_MS = 300;
const LOCAL_TIMEOUT_MS = 30_000;
const LIVE_TIMEOUT_MS = 120_000;

const replayAdapter = new ReplayAdapter(AZURE_RECORDINGS);

/** Remove any occurrence of the key from a message, just in case */
function redact(message: string, apiKey: string): string {
  const key = apiKey.trim();
  if (key.length < 4) return message;
  return message.split(key).join('[redacted]');
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Runs MedicalAnalyzer for the Analyzer view.
 *
 * - Local and recorded modes re-run automatically (debounced) when the
 *   text or settings change.
 * - Live mode calls Azure only when `analyze()` is called; changing the
 *   text or settings aborts an in-flight live call and clears its result.
 * - In-flight runs are aborted when inputs change, the view is disabled,
 *   or the component unmounts.
 */
export function useAnalyzer(
  text: string,
  settings: AnalyzerSettings,
  enabled: boolean,
): AnalyzerOutput {
  const [run, setRun] = useState<AnalyzerRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const latest = useRef({ text, settings });
  latest.current = { text, settings };

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
  }, []);

  const execute = useCallback(async (input: string, s: AnalyzerSettings) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    let capturing: CapturingAdapter | undefined;
    if (s.provider === 'recorded') {
      capturing = new CapturingAdapter(replayAdapter);
    } else if (s.provider === 'live') {
      capturing = new CapturingAdapter(
        new AzureHealthAdapter({ endpoint: s.endpoint.trim(), apiKey: s.apiKey.trim() }),
      );
    }

    setLoading(true);
    setError(null);
    try {
      const analyzer = new MedicalAnalyzer({
        providers: capturing ? [capturing] : [],
        phiPolicy: s.phiPolicy,
        negationPolicy: s.negationPolicy,
        timeoutMs: s.provider === 'live' ? LIVE_TIMEOUT_MS : LOCAL_TIMEOUT_MS,
      });
      const analysis = await analyzer.analyze(input, { signal: controller.signal });
      if (controllerRef.current !== controller) return;
      // Redact provider reasons defensively (live errors come from Azure)
      for (const p of analysis.metadata.providers) {
        if (p.reason) p.reason = redact(p.reason, s.apiKey);
      }
      setRun({
        analysis,
        mode: s.provider,
        sentText: capturing?.capture.sentText,
        providerResult: capturing?.capture.result,
      });
      setLoading(false);
      controllerRef.current = null;
    } catch (err) {
      if (controllerRef.current !== controller || isAbort(err) || controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(redact(message, s.apiKey));
      setLoading(false);
      controllerRef.current = null;
    }
  }, []);

  const { provider, phiPolicy, negationPolicy, endpoint, apiKey } = settings;
  const isLive = provider === 'live';

  // Auto-run (local / recorded), debounced
  useEffect(() => {
    if (!enabled) {
      cancel();
      return;
    }
    if (isLive) return;
    if (!text.trim()) {
      cancel();
      setRun(null);
      setError(null);
      return;
    }
    controllerRef.current?.abort();
    const timer = setTimeout(() => {
      void execute(latest.current.text, latest.current.settings);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, isLive, text, provider, phiPolicy, negationPolicy, execute, cancel]);

  // Live mode: any input change invalidates the previous live result
  useEffect(() => {
    if (!enabled || !isLive) return;
    cancel();
    setRun(null);
    setError(null);
  }, [enabled, isLive, text, phiPolicy, negationPolicy, endpoint, apiKey, cancel]);

  // Abort on unmount
  useEffect(() => () => controllerRef.current?.abort(), []);

  const canAnalyze =
    enabled && isLive && endpoint.trim() !== '' && apiKey.trim() !== '' && text.trim() !== '';

  const analyze = useCallback(() => {
    const { text: t, settings: s } = latest.current;
    if (s.provider !== 'live' || !s.endpoint.trim() || !s.apiKey.trim() || !t.trim()) return;
    void execute(t, s);
  }, [execute]);

  return { run, loading, error, canAnalyze, analyze };
}
