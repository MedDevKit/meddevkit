import type { DetectionResults } from '../hooks/useChunker';

interface AnnotatedViewProps {
  text: string;
  detections: DetectionResults;
  config: {
    preserveVitals: boolean;
    phiDetection: boolean;
    detectNegations: boolean;
  };
}

interface Span {
  start: number;
  end: number;
  type: 'phi' | 'vital' | 'section' | 'negation';
  label?: string;
  confidence?: number;
}

const TYPE_STYLES: Record<Span['type'], { bg: string; text: string; border: string }> = {
  phi: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  vital: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  section: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  negation: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
};

function buildSpans(text: string, detections: DetectionResults, config: AnnotatedViewProps['config']): Span[] {
  const spans: Span[] = [];

  if (config.preserveVitals) {
    for (const v of detections.vitals) {
      spans.push({
        start: v.startOffset,
        end: v.endOffset,
        type: 'vital',
        label: v.type.replace(/_/g, ' '),
      });
    }
  }

  if (config.phiDetection) {
    for (const p of detections.phi) {
      spans.push({
        start: p.startOffset,
        end: p.endOffset,
        type: 'phi',
        label: p.type,
        confidence: p.confidence,
      });
    }
  }

  // Sections: highlight just the header line
  for (const s of detections.sections) {
    const lineEnd = text.indexOf('\n', s.startOffset);
    spans.push({
      start: s.startOffset,
      end: lineEnd === -1 ? Math.min(s.startOffset + s.header.length + 1, text.length) : lineEnd,
      type: 'section',
      label: s.type.replace(/_/g, ' '),
    });
  }

  if (config.detectNegations) {
    for (const n of detections.negations) {
      spans.push({
        start: n.startOffset,
        end: n.endOffset,
        type: 'negation',
        label: n.type,
        confidence: n.confidence,
      });
    }
  }

  // Sort by start, then by length (shorter spans first for nesting)
  spans.sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));

  return spans;
}

// Flatten overlapping spans into non-overlapping segments
interface Segment {
  start: number;
  end: number;
  types: Span[];
}

function flattenSpans(spans: Span[], textLength: number): Segment[] {
  if (spans.length === 0) return [{ start: 0, end: textLength, types: [] }];

  // Collect all boundary points
  const points = new Set<number>();
  points.add(0);
  points.add(textLength);
  for (const s of spans) {
    points.add(Math.max(0, s.start));
    points.add(Math.min(textLength, s.end));
  }

  const sorted = Array.from(points).sort((a, b) => a - b);
  const segments: Segment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue;

    const activeSpans = spans.filter((s) => s.start <= start && s.end >= end);
    segments.push({ start, end, types: activeSpans });
  }

  return segments;
}

export default function AnnotatedView({ text, detections, config }: AnnotatedViewProps) {
  if (!text.trim()) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Enter or select a clinical note to see annotations
      </div>
    );
  }

  const spans = buildSpans(text, detections, config);
  const segments = flattenSpans(spans, text.length);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Annotated View
        </h2>
        <Legend config={config} />
      </div>
      <div className="flex-1 overflow-auto p-4 panel-scroll">
        <div className="text-sm leading-relaxed whitespace-pre-wrap font-mono">
          {segments.map((seg, i) => {
            const content = text.slice(seg.start, seg.end);
            if (seg.types.length === 0) {
              return <span key={i}>{content}</span>;
            }

            // Use the highest-priority type for the background
            const priorityOrder: Span['type'][] = ['phi', 'vital', 'negation', 'section'];
            const primaryType = priorityOrder.find((t) =>
              seg.types.some((s) => s.type === t),
            );
            const primary = seg.types.find((s) => s.type === primaryType);
            if (!primary || !primaryType) {
              return <span key={i}>{content}</span>;
            }

            const style = TYPE_STYLES[primaryType];

            // Show badge only at the start of the span
            const isSpanStart = seg.start === primary.start;

            return (
              <span
                key={i}
                className={`${style.bg} ${style.text} rounded-sm px-0.5 relative inline`}
              >
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
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Legend({ config }: { config: AnnotatedViewProps['config'] }) {
  const items: { label: string; color: string; active: boolean }[] = [
    { label: 'Sections', color: 'bg-emerald-400', active: true },
    { label: 'Vitals', color: 'bg-blue-400', active: config.preserveVitals },
    { label: 'PHI', color: 'bg-red-400', active: config.phiDetection },
    { label: 'Negations', color: 'bg-amber-400', active: config.detectNegations },
  ];

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((item) => (
        <div
          key={item.label}
          className={`flex items-center gap-1.5 text-xs ${
            item.active ? 'text-slate-600' : 'text-slate-300'
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-sm ${item.active ? item.color : 'bg-slate-200'}`}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}
