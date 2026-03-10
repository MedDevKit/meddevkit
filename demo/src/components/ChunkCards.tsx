import type { ChunkingResult } from '@meddevkit/chunker';

interface ChunkCardsProps {
  result: ChunkingResult | null;
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

export default function ChunkCards({ result }: ChunkCardsProps) {
  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Process a note to see chunks
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Chunks
        </h2>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-3 panel-scroll">
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
              className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">#{i + 1}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sectionColor}`}
                  >
                    {formatSection(sectionType)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="font-mono">{chunk.metadata.tokenCount} tok</span>
                  <span className="text-slate-300">|</span>
                  <span>{chunk.boundaries.splitReason}</span>
                </div>
              </div>

              <div className="px-3 py-2">
                <p className="text-xs text-slate-700 font-mono leading-relaxed line-clamp-4 whitespace-pre-wrap">
                  {chunk.text}
                </p>
              </div>

              {(phiCount > 0 || vitalsCount > 0 || negationsCount > 0) && (
                <div className="flex gap-2 px-3 py-2 border-t border-slate-100">
                  {phiCount > 0 && (
                    <Badge color="red" label={`PHI: ${phiCount}`} />
                  )}
                  {vitalsCount > 0 && (
                    <Badge color="blue" label={`Vitals: ${vitalsCount}`} />
                  )}
                  {negationsCount > 0 && (
                    <Badge color="amber" label={`Neg: ${negationsCount}`} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Badge({ color, label }: { color: 'red' | 'blue' | 'amber'; label: string }) {
  const colorMap = {
    red: 'bg-red-50 text-red-600 border-red-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
  };

  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${colorMap[color]}`}>
      {label}
    </span>
  );
}
