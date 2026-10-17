import type { ChunkingResult, MedicalEntity } from '@meddevkit/chunker';
import { categoryStyle, SOURCE_BADGE, sourceKind } from '../utils/entityDisplay';

interface ChunkCardsProps {
  result: ChunkingResult | null;
  /** Show entity chips from chunk.metadata.entities (Analyzer view) */
  showEntities?: boolean;
  /** Omit the "Chunks" panel header (when embedded under tabs) */
  hideHeader?: boolean;
}

const MAX_ENTITY_CHIPS = 12;

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

export default function ChunkCards({ result, showEntities, hideHeader }: ChunkCardsProps) {
  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Process a note to see chunks
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {!hideHeader && (
        <div className="px-4 py-3 border-b border-slate-200 bg-white">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Chunks
          </h2>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4 space-y-3 panel-scroll">
        {result.chunks.map((chunk, i) => {
          const section = chunk.metadata.section;
          const sectionType = section?.type ?? 'unknown';
          const sectionColor = SECTION_COLORS[sectionType] || SECTION_COLORS.unknown;
          const vitalsCount = chunk.metadata.vitals?.length ?? 0;
          const negationsCount = chunk.metadata.negations?.length ?? 0;
          const phiCount = chunk.phiMarkers.length;
          const medsCount = chunk.metadata.medications?.length ?? 0;
          const temporalCount = chunk.metadata.temporal?.length ?? 0;
          const severityCount = chunk.metadata.severity?.length ?? 0;

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

              {(phiCount > 0 ||
                vitalsCount > 0 ||
                negationsCount > 0 ||
                medsCount > 0 ||
                temporalCount > 0 ||
                severityCount > 0) && (
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
                  {medsCount > 0 && (
                    <Badge color="violet" label={`Meds: ${medsCount}`} />
                  )}
                  {temporalCount > 0 && (
                    <Badge color="cyan" label={`Time: ${temporalCount}`} />
                  )}
                  {severityCount > 0 && (
                    <Badge color="fuchsia" label={`Sev: ${severityCount}`} />
                  )}
                </div>
              )}

              {showEntities && (chunk.metadata.entities?.length ?? 0) > 0 && (
                <EntityChips entities={chunk.metadata.entities ?? []} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EntityChips({ entities }: { entities: MedicalEntity[] }) {
  const shown = entities.slice(0, MAX_ENTITY_CHIPS);
  const hidden = entities.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1 px-3 py-2 border-t border-slate-100">
      {shown.map((e, i) => {
        const style = categoryStyle(e.category);
        return (
          <span
            key={i}
            title={`${e.category} · ${e.sources.join(', ')}${e.isNegated ? ' · negated' : ''}`}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border max-w-[10rem] truncate ${style.bg} ${style.text} ${style.border} ${
              e.isNegated ? 'line-through' : ''
            }`}
          >
            {e.text}
            <span className="ml-1 opacity-60 no-underline">{SOURCE_BADGE[sourceKind(e)]}</span>
          </span>
        );
      })}
      {hidden > 0 && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-slate-50 text-slate-500 border-slate-200">
          +{hidden}
        </span>
      )}
    </div>
  );
}

function Badge({
  color,
  label,
}: {
  color: 'red' | 'blue' | 'amber' | 'violet' | 'cyan' | 'fuchsia';
  label: string;
}) {
  const colorMap = {
    red: 'bg-red-50 text-red-600 border-red-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    violet: 'bg-violet-50 text-violet-600 border-violet-200',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-200',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200',
  };

  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${colorMap[color]}`}>
      {label}
    </span>
  );
}
