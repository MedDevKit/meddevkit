import { useMemo, useState } from 'react';
import {
  MedicalChunker,
  normalizePhiSpans,
  phiMarkersToSpans,
  type ChunkingResult,
  type EntityCategory,
  type MedicalEntity,
  type OntologyCode,
} from '@meddevkit/chunker';
import type { AnalyzerProvider, AnalyzerRun } from '../hooks/useAnalyzer';
import { toChunkerOptions, type ChunkerConfig } from '../hooks/useChunker';
import {
  CATEGORY_ORDER,
  SOURCE_BADGE,
  SOURCE_BADGE_STYLE,
  assertionPills,
  categoryLabel,
  categoryStyle,
  disagreementDetail,
  isDisagreement,
  medicationAttributes,
  sourceKind,
  splitCodes,
  type SourceKind,
} from '../utils/entityDisplay';
import ChunkCards from './ChunkCards';

type Tab = 'entities' | 'sent' | 'chunks';
type Filter = 'all' | 'provider' | 'local' | 'both' | 'disagree';

interface AnalyzerSidePanelProps {
  run: AnalyzerRun | null;
  loading: boolean;
  provider: AnalyzerProvider;
  config: ChunkerConfig;
  onSelectEntity: (index: number) => void;
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'entities', label: 'Entities' },
  { value: 'sent', label: 'Sent' },
  { value: 'chunks', label: 'Chunks' },
];

export default function AnalyzerSidePanel({
  run,
  loading,
  provider,
  config,
  onSelectEntity,
}: AnalyzerSidePanelProps) {
  const [tab, setTab] = useState<Tab>('entities');

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 border-b border-slate-200 bg-white">
        <div role="tablist" aria-label="Analyzer details" className="flex gap-4">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              id={`analyzer-tab-${t.value}`}
              aria-selected={tab === t.value}
              aria-controls={`analyzer-panel-${t.value}`}
              onClick={() => setTab(t.value)}
              className={`pb-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                tab === t.value
                  ? 'border-emerald-500 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div
        role="tabpanel"
        id={`analyzer-panel-${tab}`}
        aria-labelledby={`analyzer-tab-${tab}`}
        className="flex-1 overflow-hidden"
      >
        {!run ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm px-6 text-center">
            {loading ? 'Analyzing…' : provider === 'live' ? 'Click Analyze to run.' : 'No analysis yet'}
          </div>
        ) : tab === 'entities' ? (
          <EntitiesTab run={run} onSelectEntity={onSelectEntity} />
        ) : tab === 'sent' ? (
          <SentTab run={run} />
        ) : (
          <ChunksTab run={run} config={config} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'provider', label: 'Azure-only' },
  { value: 'local', label: 'Local-only' },
  { value: 'both', label: 'Both' },
  { value: 'disagree', label: '⚠ Disagree' },
];

function matchesFilter(e: MedicalEntity, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'disagree') return isDisagreement(e);
  return sourceKind(e) === (filter as SourceKind);
}

function EntitiesTab({
  run,
  onSelectEntity,
}: {
  run: AnalyzerRun;
  onSelectEntity: (index: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const entities = run.analysis.entities;

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, provider: 0, local: 0, both: 0, disagree: 0 };
    for (const e of entities) {
      c.all++;
      c[sourceKind(e)]++;
      if (isDisagreement(e)) c.disagree++;
    }
    return c;
  }, [entities]);

  const groups = useMemo(() => {
    const byCategory = new Map<EntityCategory, number[]>();
    entities.forEach((e, idx) => {
      if (!matchesFilter(e, filter)) return;
      const list = byCategory.get(e.category) ?? [];
      list.push(idx);
      byCategory.set(e.category, list);
    });
    const order = [
      ...CATEGORY_ORDER,
      ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
    ];
    return order
      .filter((c) => byCategory.has(c))
      .map((c) => ({ category: c, indexes: byCategory.get(c) ?? [] }));
  }, [entities, filter]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-slate-200 bg-white" role="radiogroup" aria-label="Filter entities">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`px-2 py-0.5 text-[11px] rounded-md font-medium transition-colors ${
              filter === f.value
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label} <span className="opacity-70">{counts[f.value]}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4 panel-scroll">
        {groups.length === 0 && (
          <p className="text-sm text-slate-400 text-center mt-6">No entities match this filter</p>
        )}
        {groups.map((g) => {
          const style = categoryStyle(g.category);
          return (
            <section key={g.category}>
              <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                <span className={`w-2.5 h-2.5 rounded-sm ${style.swatch}`} />
                {categoryLabel(g.category)}
                <span className="text-slate-400 font-normal">{g.indexes.length}</span>
              </h3>
              <ul className="space-y-1.5">
                {g.indexes.map((idx) => (
                  <EntityRow key={idx} entity={entities[idx]} onSelect={() => onSelectEntity(idx)} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EntityRow({ entity: e, onSelect }: { entity: MedicalEntity; onSelect: () => void }) {
  const [showAllCodes, setShowAllCodes] = useState(false);
  const kind = sourceKind(e);
  const style = categoryStyle(e.category);
  const { primary, rest } = splitCodes(e.codes);
  const codes: OntologyCode[] = showAllCodes ? [...primary, ...rest] : primary;
  const meds = medicationAttributes(e);
  const pills = assertionPills(e);

  return (
    <li
      onClick={onSelect}
      className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 shadow-sm hover:shadow-md hover:border-slate-300 transition-shadow cursor-pointer"
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onSelect();
          }}
          title="Show in note"
          className={`text-xs font-mono px-1 rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${style.bg} ${style.text} ${
            e.isNegated ? 'line-through' : ''
          }`}
        >
          {e.text}
        </button>
        <span className={`text-[9px] font-semibold px-1 rounded border ${SOURCE_BADGE_STYLE[kind]}`}>
          {SOURCE_BADGE[kind]}
        </span>
        {e.isNegated && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            negated
          </span>
        )}
        {pills.map((p) => (
          <span
            key={p.label}
            title={p.title}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"
          >
            {p.label}
          </span>
        ))}
      </div>
      {isDisagreement(e) && (
        <p className="text-[10px] text-amber-700 mt-1">⚠ {disagreementDetail(e)}</p>
      )}
      {meds && <p className="text-[10px] text-violet-700 mt-1 font-mono">{meds}</p>}
      {(codes.length > 0 || rest.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-1">
          {codes.map((c) => (
            <span
              key={`${c.system}:${c.code}`}
              title={c.name}
              className="text-[9px] font-mono px-1 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200"
            >
              {c.system}:{c.code}
            </span>
          ))}
          {rest.length > 0 && (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                setShowAllCodes((v) => !v);
              }}
              aria-expanded={showAllCodes}
              className="text-[9px] font-semibold px-1 py-0.5 rounded border bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
            >
              {showAllCodes ? 'less' : `+${rest.length}`}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sent
// ---------------------------------------------------------------------------

function placeholderRanges(run: AnalyzerRun, sent: string): { start: number; end: number }[] {
  const { analysis } = run;
  // Masking is same-length, so detected PHI offsets locate the placeholders exactly
  if (analysis.metadata.phiPolicy === 'mask' && sent.length === analysis.text.length) {
    return normalizePhiSpans(phiMarkersToSpans(analysis.phi), sent.length).map((s) => ({
      start: s.startOffset,
      end: s.endOffset,
    }));
  }
  if (analysis.metadata.phiPolicy !== 'mask') return [];
  const ranges: { start: number; end: number }[] = [];
  for (const m of sent.matchAll(/\[[A-Z_]+\]_*/g)) {
    ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return ranges;
}

function SentTab({ run }: { run: AnalyzerRun }) {
  const outcome = run.analysis.metadata.providers[0];
  const sent = run.sentText;

  let message: string | undefined;
  if (run.mode === 'local') message = 'Nothing sent — local only.';
  else if (outcome?.status === 'skipped' && outcome.reason === 'phi-blocked')
    message = 'Not sent — PHI detected (block policy).';
  else if (outcome?.status === 'skipped') message = `Not sent — ${outcome.reason ?? 'skipped'}.`;
  else if (outcome?.status === 'unavailable')
    message = run.mode === 'recorded' ? 'Nothing sent — no recordings available.' : 'Nothing sent — provider unavailable.';
  else if (sent === undefined) message = 'Nothing sent.';

  if (message || sent === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm px-6 text-center">
        {message}
      </div>
    );
  }

  const ranges = placeholderRanges(run, sent);
  const parts: { text: string; placeholder: boolean }[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) parts.push({ text: sent.slice(cursor, r.start), placeholder: false });
    parts.push({ text: sent.slice(r.start, r.end), placeholder: true });
    cursor = r.end;
  }
  if (cursor < sent.length) parts.push({ text: sent.slice(cursor), placeholder: false });

  const caption =
    run.mode === 'recorded'
      ? outcome?.status === 'failed'
        ? 'Text looked up in the recordings (no match; nothing was sent).'
        : 'Replayed from a recording of this exact text (nothing sent now).'
      : 'Exact text sent to your Azure endpoint.';

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-slate-200 bg-white text-[11px] text-slate-500 flex items-center justify-between gap-2">
        <span>{caption}</span>
        <span className="font-mono whitespace-nowrap">
          {sent.length} chars · {ranges.length} masked
        </span>
      </div>
      <div className="flex-1 overflow-auto p-4 panel-scroll">
        <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-slate-700">
          {parts.map((p, i) =>
            p.placeholder ? (
              <mark key={i} className="bg-red-100 text-red-800 rounded-sm">
                {p.text}
              </mark>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chunks
// ---------------------------------------------------------------------------

function ChunksTab({ run, config }: { run: AnalyzerRun; config: ChunkerConfig }) {
  const { result, error } = useMemo((): { result: ChunkingResult | null; error: string | null } => {
    try {
      const chunker = new MedicalChunker(toChunkerOptions(config));
      return {
        result: chunker.chunk(run.analysis.text, { entities: run.analysis.entities }),
        error: null,
      };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }, [run, config]);

  if (error) {
    return <div className="p-4 text-xs text-red-700">Chunking failed: {error}</div>;
  }
  return <ChunkCards result={result} showEntities hideHeader />;
}
