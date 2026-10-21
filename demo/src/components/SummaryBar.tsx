import type { ChunkingResult } from '@meddevkit/chunker';
import type { DetectionResults } from '../hooks/useChunker';
import type { NaiveChunkerResult } from '../utils/naiveChunker';
import type { BrokenPattern } from '../utils/brokenPatternDetector';
import type { MedicalAnalysisResult } from '@meddevkit/chunker';
import { isDisagreement, sourceKind } from '../utils/entityDisplay';

interface SummaryBarProps {
  result: ChunkingResult | null;
  detections: DetectionResults;
  compareMode?: boolean;
  naiveResult?: NaiveChunkerResult;
  brokenPatterns?: BrokenPattern[];
  /** Same detection on MedDevKit's chunks; omitted from the footer when null */
  medDevKitBrokenPatterns?: BrokenPattern[] | null;
  /** Analyzer view: show entity counts for this analysis */
  analyzerMode?: boolean;
  analysis?: MedicalAnalysisResult | null;
}

export default function SummaryBar({
  result,
  detections,
  compareMode,
  naiveResult,
  brokenPatterns,
  medDevKitBrokenPatterns,
  analyzerMode,
  analysis,
}: SummaryBarProps) {
  if (analyzerMode) {
    return <AnalyzerSummary analysis={analysis ?? null} />;
  }

  if (!result) {
    return (
      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-400 text-center">
        Select or enter a clinical note to begin
      </footer>
    );
  }

  const { metadata } = result;

  if (compareMode && naiveResult && brokenPatterns) {
    // Document-level counts: per-chunk lists also include items in the overlap text
    const vitalsPreserved = metadata.vitalsDetected;
    const medsPreserved = metadata.medicationsDetected;
    const countUnique = (patterns: BrokenPattern[]) =>
      new Set(patterns.map((bp) => bp.originalText)).size;

    const stats = [
      {
        label: 'broken by generic splitter',
        value: countUnique(brokenPatterns),
        icon: '⚠',
        color: 'text-orange-600',
      },
      ...(medDevKitBrokenPatterns
        ? [
            {
              label: 'broken by MedDevKit',
              value: countUnique(medDevKitBrokenPatterns),
              icon: '✓',
              color: 'text-emerald-600',
            },
          ]
        : []),
      { label: 'Vitals Preserved', value: vitalsPreserved, icon: '💙', color: 'text-emerald-600' },
      { label: 'Meds Preserved', value: medsPreserved, icon: '💊', color: 'text-emerald-600' },
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
    { label: 'Meds', value: detections.medications.length, icon: '💊', color: 'text-violet-600' },
    { label: 'Temporal', value: detections.temporal.length, icon: '⏱', color: 'text-cyan-600' },
    { label: 'Severity', value: detections.severity.length, icon: '▲', color: 'text-fuchsia-600' },
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

function AnalyzerSummary({ analysis }: { analysis: MedicalAnalysisResult | null }) {
  if (!analysis) {
    return (
      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-400 text-center">
        No analysis yet
      </footer>
    );
  }

  const counts = { local: 0, provider: 0, both: 0 };
  let negated = 0;
  let disagreements = 0;
  for (const e of analysis.entities) {
    counts[sourceKind(e)]++;
    if (e.isNegated) negated++;
    if (isDisagreement(e)) disagreements++;
  }

  const stats = [
    { label: 'Entities', value: analysis.entities.length, color: 'text-slate-700' },
    { label: 'Azure-only', value: counts.provider, color: 'text-sky-600' },
    { label: 'Local-only', value: counts.local, color: 'text-slate-600' },
    { label: 'Both', value: counts.both, color: 'text-emerald-600' },
    { label: 'Negated', value: negated, color: 'text-slate-600' },
    { label: 'Disagreements', value: disagreements, color: 'text-amber-600' },
  ];

  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-3">
      <div className="flex items-center justify-center gap-6 flex-wrap">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-1.5">
            <span className={`text-xs font-semibold ${stat.color}`}>{stat.value}</span>
            <span className="text-xs text-slate-400">{stat.label}</span>
          </div>
        ))}
      </div>
    </footer>
  );
}
