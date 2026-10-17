import { useEffect, useMemo, useRef, useState } from 'react';
import type { MedicalEntity, NegationContext, PhiMarker, ProviderOutcome } from '@meddevkit/chunker';
import type { AnalyzerProvider, AnalyzerRun } from '../hooks/useAnalyzer';
import {
  LEGEND,
  PHI_STYLE,
  SOURCE_BADGE,
  SOURCE_BADGE_STYLE,
  assertionText,
  categoryLabel,
  categoryStyle,
  formatSectionType,
  isDisagreement,
  sourceKind,
  sourcesLabel,
} from '../utils/entityDisplay';

export interface EntityFocusRequest {
  index: number;
  /** Changes on every request so re-clicking the same row scrolls again */
  nonce: number;
}

interface AnalyzerViewProps {
  run: AnalyzerRun | null;
  loading: boolean;
  error: string | null;
  provider: AnalyzerProvider;
  hasText: boolean;
  focusRequest: EntityFocusRequest | null;
}

interface Segment {
  start: number;
  end: number;
  /** Indexes into analysis.entities covering the segment, shortest first */
  entities: number[];
  phi: PhiMarker[];
  /** Local negation scopes covering the segment */
  negations: NegationContext[];
}

/** Local negation scope: light amber (the Chunks view's negation color) plus a dotted underline */
const NEGATION_SCOPE_BG = 'bg-amber-50 text-amber-900';
const NEGATION_SCOPE_MARK = 'border-b-2 border-dotted border-amber-500';

const MODE_LABEL: Record<AnalyzerProvider, string> = {
  local: 'local',
  recorded: 'recorded',
  live: 'live',
};

const STATUS_STYLE: Record<ProviderOutcome['status'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  unavailable: 'bg-slate-100 text-slate-600 border-slate-200',
  skipped: 'bg-amber-50 text-amber-700 border-amber-200',
};

function providerDisplayName(name: string): string {
  return name === 'azure-health' ? 'Azure health' : name;
}

function buildSegments(
  text: string,
  entities: MedicalEntity[],
  phi: PhiMarker[],
  negations: NegationContext[],
): Segment[] {
  const len = text.length;
  const clamp = (n: number) => Math.max(0, Math.min(len, n));
  const points = new Set<number>([0, len]);
  for (const e of entities) {
    points.add(clamp(e.startOffset));
    points.add(clamp(e.endOffset));
  }
  for (const p of phi) {
    points.add(clamp(p.startOffset));
    points.add(clamp(p.endOffset));
  }
  for (const n of negations) {
    points.add(clamp(n.startOffset));
    points.add(clamp(n.endOffset));
  }
  const sorted = Array.from(points).sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue;
    const covering: number[] = [];
    entities.forEach((e, idx) => {
      if (e.startOffset <= start && e.endOffset >= end) covering.push(idx);
    });
    covering.sort((a, b) => {
      const la = entities[a].endOffset - entities[a].startOffset;
      const lb = entities[b].endOffset - entities[b].startOffset;
      return la - lb || a - b;
    });
    segments.push({
      start,
      end,
      entities: covering,
      phi: phi.filter((p) => p.startOffset <= start && p.endOffset >= end),
      negations: negations.filter((n) => n.startOffset <= start && n.endOffset >= end),
    });
  }
  return segments;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function entityAriaLabel(e: MedicalEntity): string {
  const parts = [`${categoryLabel(e.category)} "${e.text}"`];
  if (e.isNegated) parts.push('negated');
  if (isDisagreement(e)) parts.push('local and Azure negation disagree');
  parts.push(`sources ${sourcesLabel(e)}`);
  return parts.join(', ');
}

export default function AnalyzerView({
  run,
  loading,
  error,
  provider,
  hasText,
  focusRequest,
}: AnalyzerViewProps) {
  const analysis = run?.analysis;
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ seg: number; rect: DOMRect } | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);

  const segments = useMemo(
    () =>
      analysis
        ? buildSegments(analysis.text, analysis.entities, analysis.phi, analysis.negations)
        : [],
    [analysis],
  );

  // Scroll to and briefly highlight an entity selected in the side panel
  useEffect(() => {
    if (!focusRequest || !analysis) return;
    const entity = analysis.entities[focusRequest.index];
    if (!entity) return;
    setHighlight(focusRequest.index);
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-seg-start="${entity.startOffset}"]`,
    );
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = setTimeout(() => setHighlight(null), 3000);
    return () => clearTimeout(timer);
  }, [focusRequest, analysis]);

  // Hide the tooltip when the result changes or the text scrolls
  useEffect(() => setTooltip(null), [analysis]);

  const providerFailed = analysis?.metadata.providers.find((p) => p.status === 'failed');
  const liveFailure = run?.mode === 'live' && providerFailed ? providerFailed.reason : undefined;
  const retries = run?.providerResult?.metadata?.retries;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Analyzer
        </h2>
        <StatusStrip
          run={run}
          loading={loading}
          provider={provider}
          negationScopes={analysis?.negations.length ?? 0}
          retries={typeof retries === 'number' ? retries : undefined}
        />
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {LEGEND.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className={`w-2.5 h-2.5 rounded-sm ${item.swatch}`} />
              {item.label}
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`${NEGATION_SCOPE_BG} ${NEGATION_SCOPE_MARK} px-0.5`}>negation scope</span>
            <span className="line-through">negated</span>
            <span className="text-amber-600">⚠ disagree</span>
            <span className="font-mono text-[10px]">L · A · L+A source</span>
          </div>
        </div>
      </div>

      {(error || liveFailure) && (
        <div role="alert" className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700">
          {error ? `Error: ${error}` : `Azure request failed: ${liveFailure}. Showing local results.`}
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 panel-scroll"
        onScroll={() => tooltip && setTooltip(null)}
      >
        {!analysis ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm text-center px-6">
            {!hasText
              ? 'Enter or select a clinical note to analyze'
              : provider === 'live'
                ? loading
                  ? 'Calling Azure…'
                  : 'Live mode: enter your endpoint and key, then click Analyze.'
                : 'Analyzing…'}
          </div>
        ) : (
          <div className="text-sm leading-relaxed whitespace-pre-wrap font-mono">
            {segments.map((seg, i) => {
              const content = analysis.text.slice(seg.start, seg.end);
              if (seg.entities.length === 0 && seg.phi.length === 0 && seg.negations.length === 0) {
                return <span key={i}>{content}</span>;
              }
              const covering = seg.entities.map((idx) => analysis.entities[idx]);
              const isPhi = seg.phi.length > 0;
              const inNegation = seg.negations.length > 0;
              const primary = isPhi ? undefined : covering[0];
              const outers = isPhi ? covering : covering.slice(1);
              const bg = primary
                ? `${categoryStyle(primary.category).bg} ${categoryStyle(primary.category).text}`
                : isPhi
                  ? `${PHI_STYLE.bg} ${PHI_STYLE.text}`
                  : NEGATION_SCOPE_BG;
              const shadows = outers
                .slice(0, 3)
                .map((e, n) => `0 ${2 * (n + 1)}px 0 ${categoryStyle(e.category).hex}`);
              const negated = covering.some((e) => e.isNegated);
              const highlighted = highlight !== null && seg.entities.includes(highlight);
              const endings = seg.entities.filter((idx) => analysis.entities[idx].endOffset === seg.end);
              const label = [
                ...seg.phi.map((p) => `PHI ${p.type}`),
                ...seg.negations.map((n) => `local negation ${n.type}`),
                ...covering.map(entityAriaLabel),
              ].join('; ');

              return (
                <span key={i}>
                  <span
                    data-seg-start={seg.start}
                    tabIndex={0}
                    aria-label={label}
                    onMouseEnter={(ev) => setTooltip({ seg: i, rect: ev.currentTarget.getBoundingClientRect() })}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={(ev) => setTooltip({ seg: i, rect: ev.currentTarget.getBoundingClientRect() })}
                    onBlur={() => setTooltip(null)}
                    className={`${bg} ${inNegation ? NEGATION_SCOPE_MARK : ''} rounded-sm cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      negated ? 'line-through decoration-slate-500' : ''
                    } ${highlighted ? 'outline outline-2 outline-slate-800' : ''}`}
                    style={shadows.length ? { boxShadow: shadows.join(', ') } : undefined}
                  >
                    {content}
                  </span>
                  {endings.map((idx) => {
                    const e = analysis.entities[idx];
                    const kind = sourceKind(e);
                    return (
                      <span key={idx} aria-hidden="true" className="whitespace-nowrap">
                        <sup
                          className={`ml-px px-0.5 rounded border text-[8px] font-sans font-semibold no-underline ${SOURCE_BADGE_STYLE[kind]}`}
                        >
                          {SOURCE_BADGE[kind]}
                        </sup>
                        {isDisagreement(e) && <sup className="text-amber-600 text-[10px] font-sans">⚠</sup>}
                      </span>
                    );
                  })}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {tooltip && analysis && segments[tooltip.seg] && (
        <SegmentTooltip
          rect={tooltip.rect}
          entities={segments[tooltip.seg].entities.map((idx) => analysis.entities[idx])}
          phi={segments[tooltip.seg].phi}
          negations={segments[tooltip.seg].negations}
        />
      )}
    </div>
  );
}

function StatusStrip({
  run,
  loading,
  provider,
  negationScopes,
  retries,
}: {
  run: AnalyzerRun | null;
  loading: boolean;
  provider: AnalyzerProvider;
  negationScopes: number;
  retries?: number;
}) {
  const m = run?.analysis.metadata;
  const pill = 'text-[10px] font-medium px-1.5 py-0.5 rounded border';

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
      {loading && (
        <span className="flex items-center gap-1.5 text-slate-600">
          <span
            className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-emerald-600 animate-spin"
            aria-hidden="true"
          />
          Analyzing…
        </span>
      )}
      {!m && !loading && <span className="text-slate-400">{MODE_LABEL[provider]} · not run yet</span>}
      {m && (
        <>
          <span className={`${pill} bg-slate-900 text-white border-slate-900 uppercase`}>
            {MODE_LABEL[run.mode]}
          </span>
          {m.providers.length === 0 && (
            <span className={`${pill} bg-slate-100 text-slate-600 border-slate-200`}>
              meddevkit-local only
            </span>
          )}
          {m.providers.map((p) => (
            <span key={p.name} className={`${pill} ${STATUS_STYLE[p.status]}`}>
              {providerDisplayName(p.name)}: {p.status}
              {p.status === 'unavailable' && run.mode === 'recorded' && ' (no recordings)'}
              {p.reason && ` — ${p.reason}`}
              {p.processingTimeMs !== undefined && ` · ${Math.round(p.processingTimeMs)} ms`}
            </span>
          ))}
          {m.degraded && (
            <span className={`${pill} bg-amber-50 text-amber-700 border-amber-200`}>degraded</span>
          )}
          <Stat label="total" value={`${Math.round(m.processingTimeMs * 10) / 10} ms`} />
          <Stat label="PHI masked" value={m.phiSpansProtected} />
          <Stat label="masked drops" value={m.droppedMaskedEntities} />
          <Stat label="negation scopes" value={negationScopes} />
          <Stat label="disagreements" value={m.negationDisagreements} warn={m.negationDisagreements > 0} />
          {retries !== undefined && <Stat label="retries" value={retries} warn={retries > 0} />}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <span className="text-[10px] text-slate-500">
      <span className={`font-semibold ${warn ? 'text-amber-600' : 'text-slate-700'}`}>{value}</span>{' '}
      {label}
    </span>
  );
}

function SegmentTooltip({
  rect,
  entities,
  phi,
  negations,
}: {
  rect: DOMRect;
  entities: MedicalEntity[];
  phi: PhiMarker[];
  negations: NegationContext[];
}) {
  const width = 320;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = rect.bottom + 260 < window.innerHeight;
  const position = below
    ? { top: rect.bottom + 6 }
    : { bottom: window.innerHeight - rect.top + 6 };

  return (
    <div
      role="tooltip"
      className="fixed z-50 max-h-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg p-2.5 space-y-2 pointer-events-none"
      style={{ left, width, ...position }}
    >
      {phi.map((p, i) => (
        <div key={`phi-${i}`} className="text-[11px]">
          <span className={`font-semibold uppercase text-[10px] px-1 rounded ${PHI_STYLE.bg} ${PHI_STYLE.text}`}>
            PHI · {p.type}
          </span>{' '}
          <span className="text-slate-500">{pct(p.confidence)}</span>
        </div>
      ))}
      {negations.map((n, i) => (
        <div key={`neg-${i}`} className="text-[11px] text-slate-700">
          <span className={`font-semibold text-[10px] px-1 rounded ${NEGATION_SCOPE_BG} ${NEGATION_SCOPE_MARK}`}>
            local negation: {n.type}
          </span>{' '}
          <span className="text-slate-500">{pct(n.confidence)}</span>
        </div>
      ))}
      {entities.map((e, i) => {
        const style = categoryStyle(e.category);
        const assertion = assertionText(e);
        const codes = (e.codes ?? []).map((c) => `${c.system}:${c.code}`);
        const yn = (v: boolean | undefined) => (v === undefined ? '—' : v ? 'yes' : 'no');
        return (
          <div key={i} className={`text-[11px] text-slate-700 ${i > 0 || phi.length || negations.length ? 'pt-2 border-t border-slate-100' : ''}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`font-semibold text-[10px] uppercase px-1 rounded ${style.bg} ${style.text}`}>
                {categoryLabel(e.category)}
                {e.providerCategory && e.providerCategory !== e.category && ` (${e.providerCategory})`}
              </span>
              <span className="text-slate-500">{pct(e.confidence)}</span>
            </div>
            <div className="font-mono text-slate-900 truncate">“{e.text}”</div>
            <dl className="grid grid-cols-[auto,1fr] gap-x-2 text-[10px] mt-0.5">
              <dt className="text-slate-400">sources</dt>
              <dd>{sourcesLabel(e)}</dd>
              {codes.length > 0 && (
                <>
                  <dt className="text-slate-400">codes</dt>
                  <dd className="font-mono break-all">{codes.slice(0, 6).join(', ')}{codes.length > 6 ? ` +${codes.length - 6}` : ''}</dd>
                </>
              )}
              {assertion && (
                <>
                  <dt className="text-slate-400">assertion</dt>
                  <dd>{assertion}</dd>
                </>
              )}
              <dt className="text-slate-400">negation</dt>
              <dd>
                local {yn(e.negation?.local)} · provider {yn(e.negation?.provider)} · final{' '}
                <span className="font-semibold">{e.isNegated ? 'negated' : 'not negated'}</span>
                {isDisagreement(e) && <span className="text-amber-600"> ⚠</span>}
              </dd>
              {e.section && (
                <>
                  <dt className="text-slate-400">section</dt>
                  <dd>{formatSectionType(e.section)}</dd>
                </>
              )}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
