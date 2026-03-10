import type { ChunkingResult, MedicalChunk } from '@meddevkit/chunker';
import type { NaiveChunkerResult } from '../utils/naiveChunker';
import type { BrokenPattern } from '../utils/brokenPatternDetector';

const ANNOTATION_STYLES = {
  phi: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  vital: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  negation: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
};

interface ComparisonPanelProps {
  result: ChunkingResult | null;
  naiveResult: NaiveChunkerResult;
  brokenPatterns: BrokenPattern[];
}

const SECTION_COLORS: Record<string, string> = {
  chief_complaint: 'bg-purple-100 text-purple-700',
  hpi: 'bg-sky-100 text-sky-700',
  past_medical_history: 'bg-teal-100 text-teal-700',
  past_surgical_history: 'bg-teal-100 text-teal-700',
  medications: 'bg-indigo-100 text-indigo-700',
  allergies: 'bg-rose-100 text-rose-700',
  family_history: 'bg-violet-100 text-violet-700',
  social_history: 'bg-fuchsia-100 text-fuchsia-700',
  review_of_systems: 'bg-cyan-100 text-cyan-700',
  physical_exam: 'bg-emerald-100 text-emerald-700',
  vitals: 'bg-blue-100 text-blue-700',
  assessment: 'bg-orange-100 text-orange-700',
  plan: 'bg-amber-100 text-amber-700',
  labs: 'bg-lime-100 text-lime-700',
  imaging: 'bg-stone-100 text-stone-700',
  procedures: 'bg-zinc-100 text-zinc-700',
  unknown: 'bg-slate-100 text-slate-600',
};

function formatSection(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function ComparisonPanel({
  result,
  naiveResult,
  brokenPatterns,
}: ComparisonPanelProps) {
  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Process a note to see comparison
      </div>
    );
  }

  const brokenByChunk = new Map<number, BrokenPattern[]>();
  for (const bp of brokenPatterns) {
    const list = brokenByChunk.get(bp.chunkIndex) || [];
    list.push(bp);
    brokenByChunk.set(bp.chunkIndex, list);
  }

  const chunkDiff = naiveResult.totalChunks - result.metadata.totalChunks;
  const uniqueBroken = new Set(brokenPatterns.map((bp) => bp.originalText)).size;

  // Total text length for position bars
  const totalLength =
    naiveResult.chunks.length > 0
      ? naiveResult.chunks[naiveResult.chunks.length - 1].endOffset
      : 1;

  return (
    <div className="flex flex-col h-full">
      {/* Summary row */}
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-center gap-6 text-xs">
          <span className="text-slate-500">
            <span className="font-semibold text-orange-600">{naiveResult.totalChunks}</span>
            {' vs '}
            <span className="font-semibold text-emerald-600">{result.metadata.totalChunks}</span>
            {' chunks'}
            {chunkDiff > 0 && (
              <span className="text-orange-500 ml-1">(+{chunkDiff} generic)</span>
            )}
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">
            <span className="font-semibold text-orange-600">{uniqueBroken}</span>
            {' broken pattern'}{uniqueBroken !== 1 ? 's' : ''}
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">
            <span className="font-semibold text-emerald-600">
              {result.chunks.reduce((sum, c) => sum + (c.metadata.vitals?.length ?? 0), 0)}
            </span>
            {' vitals preserved'}
          </span>
        </div>
      </div>

      {/* Two columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Generic Chunker */}
        <div className="flex-1 flex flex-col border-r border-slate-200">
          <div className="px-4 py-2 border-b border-orange-200 bg-orange-50">
            <h2 className="text-xs font-semibold text-orange-700 uppercase tracking-wider">
              Generic Chunker
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-3 panel-scroll bg-orange-50/30">
            {naiveResult.chunks.map((chunk) => {
              const patterns = brokenByChunk.get(chunk.index) || [];
              const hasBroken = patterns.length > 0;

              return (
                <div
                  key={chunk.index}
                  className={`rounded-lg border shadow-sm overflow-hidden ${
                    hasBroken
                      ? 'border-orange-300 bg-white'
                      : 'border-orange-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-orange-100 bg-orange-50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-orange-400">#{chunk.index + 1}</span>
                      {hasBroken && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-600 text-white">
                          Context Broken
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-orange-400 font-mono">
                      {chunk.tokenCount} tok
                    </span>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-xs text-slate-700 font-mono leading-relaxed whitespace-pre-wrap">
                      {hasBroken
                        ? renderWithBrokenHighlights(chunk.text, patterns)
                        : chunk.text}
                    </p>
                  </div>
                  <PositionBar
                    startOffset={chunk.startOffset}
                    endOffset={chunk.endOffset}
                    totalLength={totalLength}
                    color="orange"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: MedDevKit */}
        <div className="flex-1 flex flex-col">
          <div className="px-4 py-2 border-b border-emerald-200 bg-emerald-50">
            <h2 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              MedDevKit
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-3 panel-scroll bg-emerald-50/30">
            {result.chunks.map((chunk, i) => {
              const section = chunk.metadata.section;
              const sectionType = section?.type ?? 'unknown';
              const sectionColor = SECTION_COLORS[sectionType] || SECTION_COLORS.unknown;
              const vitalsCount = chunk.metadata.vitals?.length ?? 0;
              const negationsCount = chunk.metadata.negations?.length ?? 0;
              const phiCount = chunk.phiMarkers.length;

              return (
                <div
                  key={chunk.id}
                  className="bg-white rounded-lg border border-emerald-200 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-100 bg-emerald-50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-emerald-400">#{i + 1}</span>
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sectionColor}`}
                      >
                        {formatSection(sectionType)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                      <span className="font-mono">{chunk.metadata.tokenCount} tok</span>
                      <span className="text-emerald-300">|</span>
                      <span>{chunk.boundaries.splitReason}</span>
                    </div>
                  </div>

                  <div className="px-3 py-2">
                    <p className="text-xs text-slate-700 font-mono leading-relaxed whitespace-pre-wrap">
                      {renderAnnotatedChunkText(chunk)}
                    </p>
                  </div>

                  {(phiCount > 0 || vitalsCount > 0 || negationsCount > 0) && (
                    <div className="flex gap-2 px-3 py-2 border-t border-emerald-100">
                      {phiCount > 0 && (
                        <Badge color="red" label={`PHI: ${phiCount}`} />
                      )}
                      {vitalsCount > 0 && (
                        <Badge color="emerald" label={`Vitals: ${vitalsCount}`} />
                      )}
                      {negationsCount > 0 && (
                        <Badge color="amber" label={`Neg: ${negationsCount}`} />
                      )}
                    </div>
                  )}
                  <PositionBar
                    startOffset={chunk.boundaries.start}
                    endOffset={chunk.boundaries.end}
                    totalLength={totalLength}
                    color="emerald"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderWithBrokenHighlights(
  chunkText: string,
  patterns: BrokenPattern[],
): React.ReactNode {
  if (patterns.length === 0) return chunkText;

  // Sort patterns by startOffset within the chunk
  const sorted = [...patterns].sort((a, b) => a.startOffset - b.startOffset);

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const pattern of sorted) {
    const start = Math.max(0, pattern.startOffset);
    const end = Math.min(chunkText.length, pattern.endOffset);

    if (start < 0 || end > chunkText.length || start >= end) continue;

    // Text before this highlight
    if (cursor < start) {
      parts.push(chunkText.slice(cursor, start));
    }

    // Highlighted broken fragment
    parts.push(
      <span
        key={`${pattern.chunkIndex}-${start}`}
        className="bg-orange-200 text-orange-900 border-b-2 border-orange-500 px-0.5 rounded-sm"
        title={`Split from: ${pattern.originalText}`}
      >
        {chunkText.slice(start, end)}
      </span>,
    );

    cursor = end;
  }

  // Remaining text
  if (cursor < chunkText.length) {
    parts.push(chunkText.slice(cursor));
  }

  return <>{parts}</>;
}

function renderAnnotatedChunkText(chunk: MedicalChunk): React.ReactNode {
  const chunkStart = chunk.boundaries.start;

  interface ASpan {
    start: number;
    end: number;
    type: 'phi' | 'vital' | 'negation';
    label?: string;
    confidence?: number;
  }

  const spans: ASpan[] = [];

  for (const p of chunk.phiMarkers) {
    spans.push({
      start: p.startOffset - chunkStart,
      end: p.endOffset - chunkStart,
      type: 'phi',
      label: p.type,
      confidence: p.confidence,
    });
  }

  for (const v of chunk.metadata.vitals ?? []) {
    spans.push({
      start: v.startOffset - chunkStart,
      end: v.endOffset - chunkStart,
      type: 'vital',
      label: v.type.replace(/_/g, ' '),
    });
  }

  for (const n of chunk.metadata.negations ?? []) {
    spans.push({
      start: n.startOffset - chunkStart,
      end: n.endOffset - chunkStart,
      type: 'negation',
      label: n.type,
      confidence: n.confidence,
    });
  }

  if (spans.length === 0) return chunk.text;

  // Clamp to chunk text bounds
  for (const s of spans) {
    s.start = Math.max(0, s.start);
    s.end = Math.min(chunk.text.length, s.end);
  }

  // Build non-overlapping segments
  const points = new Set<number>([0, chunk.text.length]);
  for (const s of spans) {
    points.add(s.start);
    points.add(s.end);
  }
  const sorted = Array.from(points).sort((a, b) => a - b);

  const priorityOrder: ASpan['type'][] = ['phi', 'vital', 'negation'];
  const parts: React.ReactNode[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    if (segStart === segEnd) continue;

    const content = chunk.text.slice(segStart, segEnd);
    const active = spans.filter((s) => s.start <= segStart && s.end >= segEnd);

    if (active.length === 0) {
      parts.push(<span key={i}>{content}</span>);
      continue;
    }

    const primaryType = priorityOrder.find((t) => active.some((s) => s.type === t));
    const primary = active.find((s) => s.type === primaryType);
    if (!primary || !primaryType) {
      parts.push(<span key={i}>{content}</span>);
      continue;
    }

    const style = ANNOTATION_STYLES[primaryType];
    const isSpanStart = segStart === primary.start;

    parts.push(
      <span key={i} className={`${style.bg} ${style.text} rounded-sm px-0.5 relative inline`}>
        {isSpanStart && primary.label && (
          <span
            className={`inline-flex items-center text-[9px] font-semibold uppercase px-1 py-0 rounded ${style.bg} ${style.text} border ${style.border} mr-0.5 align-top`}
          >
            {primary.label}
            {primary.confidence != null && (
              <span className="ml-0.5 opacity-70">
                {(primary.confidence * 100).toFixed(0)}%
              </span>
            )}
          </span>
        )}
        {content}
      </span>,
    );
  }

  return <>{parts}</>;
}

function PositionBar({
  startOffset,
  endOffset,
  totalLength,
  color,
}: {
  startOffset: number;
  endOffset: number;
  totalLength: number;
  color: 'orange' | 'emerald';
}) {
  const left = (startOffset / totalLength) * 100;
  const width = ((endOffset - startOffset) / totalLength) * 100;
  const bgColor = color === 'orange' ? 'bg-orange-400' : 'bg-emerald-400';

  return (
    <div className="h-1.5 bg-slate-100 relative" title={`chars ${startOffset}–${endOffset}`}>
      <div
        className={`absolute top-0 h-full ${bgColor} rounded-full opacity-70`}
        style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
      />
    </div>
  );
}

function Badge({ color, label }: { color: 'red' | 'emerald' | 'amber'; label: string }) {
  const colorMap = {
    red: 'bg-red-50 text-red-600 border-red-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
  };

  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${colorMap[color]}`}>
      {label}
    </span>
  );
}
