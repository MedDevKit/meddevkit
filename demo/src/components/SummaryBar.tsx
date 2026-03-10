import type { ChunkingResult } from '@meddevkit/chunker';
import type { DetectionResults } from '../hooks/useChunker';
import type { NaiveChunkerResult } from '../utils/naiveChunker';
import type { BrokenPattern } from '../utils/brokenPatternDetector';

interface SummaryBarProps {
  result: ChunkingResult | null;
  detections: DetectionResults;
  compareMode?: boolean;
  naiveResult?: NaiveChunkerResult;
  brokenPatterns?: BrokenPattern[];
}

export default function SummaryBar({
  result,
  detections,
  compareMode,
  naiveResult,
  brokenPatterns,
}: SummaryBarProps) {
  if (!result) {
    return (
      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-400 text-center">
        Select or enter a clinical note to begin
      </footer>
    );
  }

  const { metadata } = result;

  if (compareMode && naiveResult && brokenPatterns) {
    const vitalsPreserved = result.chunks.reduce(
      (sum, c) => sum + (c.metadata.vitals?.length ?? 0),
      0,
    );
    const uniqueBroken = new Set(brokenPatterns.map((bp) => bp.originalText)).size;

    const stats = [
      { label: 'Generic', value: naiveResult.totalChunks, icon: '□', color: 'text-orange-600' },
      { label: 'MedDevKit', value: metadata.totalChunks, icon: '□', color: 'text-emerald-600' },
      { label: 'Broken Patterns', value: uniqueBroken, icon: '⚠', color: 'text-orange-600' },
      { label: 'Vitals Preserved', value: vitalsPreserved, icon: '💙', color: 'text-emerald-600' },
    ];

    return (
      <footer className="border-t border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center justify-center gap-6 flex-wrap">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-1.5">
              <span className="text-xs">{stat.icon}</span>
              <span className={`text-xs font-semibold ${stat.color}`}>
                {stat.value}
              </span>
              <span className="text-xs text-slate-400">{stat.label}</span>
            </div>
          ))}
        </div>
      </footer>
    );
  }

  const stats = [
    { label: 'Chunks', value: metadata.totalChunks, icon: '□' },
    { label: 'Time', value: `${Math.round(metadata.processingTimeMs * 100) / 100}ms`, icon: '⚡' },
    { label: 'Vitals', value: detections.vitals.length, icon: '💙', color: 'text-blue-600' },
    { label: 'PHI', value: detections.phi.length, icon: '🔴', color: 'text-red-600' },
    { label: 'Sections', value: metadata.sectionsDetected.length, icon: '📋', color: 'text-emerald-600' },
    { label: 'Negations', value: detections.negations.length, icon: '🟠', color: 'text-amber-600' },
  ];

  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-3">
      <div className="flex items-center justify-center gap-6 flex-wrap">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-1.5">
            <span className="text-xs">{stat.icon}</span>
            <span className={`text-xs font-semibold ${stat.color ?? 'text-slate-700'}`}>
              {stat.value}
            </span>
            <span className="text-xs text-slate-400">{stat.label}</span>
          </div>
        ))}
      </div>
    </footer>
  );
}
