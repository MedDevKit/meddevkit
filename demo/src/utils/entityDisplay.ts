import {
  LOCAL_ADAPTER_NAME,
  type EntityCategory,
  type MedicalEntity,
  type OntologyCode,
} from '@meddevkit/chunker';

export interface CategoryStyle {
  /** Background + text classes for highlighted text */
  bg: string;
  text: string;
  /** Border class for chips */
  border: string;
  /** Solid swatch class for the legend */
  swatch: string;
  /** Hex color for the outer-entity underline (inline style) */
  hex: string;
}

const ROSE: CategoryStyle = { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300', swatch: 'bg-rose-400', hex: '#fb7185' };
const AMBER: CategoryStyle = { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', swatch: 'bg-amber-400', hex: '#fbbf24' };
const VIOLET: CategoryStyle = { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-300', swatch: 'bg-violet-400', hex: '#a78bfa' };
const VIOLET_LIGHT: CategoryStyle = { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', swatch: 'bg-violet-200', hex: '#c4b5fd' };
const TEAL: CategoryStyle = { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300', swatch: 'bg-teal-400', hex: '#2dd4bf' };
const SKY: CategoryStyle = { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-300', swatch: 'bg-sky-400', hex: '#38bdf8' };
const BLUE: CategoryStyle = { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', swatch: 'bg-blue-400', hex: '#60a5fa' };
const CYAN: CategoryStyle = { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300', swatch: 'bg-cyan-400', hex: '#22d3ee' };
const FUCHSIA: CategoryStyle = { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-300', swatch: 'bg-fuchsia-400', hex: '#e879f9' };
const ORANGE: CategoryStyle = { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', swatch: 'bg-orange-400', hex: '#fb923c' };
const SLATE: CategoryStyle = { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', swatch: 'bg-slate-400', hex: '#94a3b8' };

/** PHI style, same as the Chunks view's AnnotatedView */
export const PHI_STYLE = { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', swatch: 'bg-red-400', hex: '#f87171' };

export const CATEGORY_STYLES: Record<EntityCategory, CategoryStyle> = {
  Diagnosis: ROSE,
  SymptomOrSign: AMBER,
  MedicationName: VIOLET,
  Dosage: VIOLET_LIGHT,
  MedicationRoute: VIOLET_LIGHT,
  MedicationFrequency: VIOLET_LIGHT,
  MedicationForm: VIOLET_LIGHT,
  BodyStructure: TEAL,
  ProcedureName: SKY,
  TestName: SKY,
  MeasurementValue: BLUE,
  VitalSign: BLUE,
  Time: CYAN,
  Severity: FUCHSIA,
  Allergen: ORANGE,
  Other: SLATE,
};

export function categoryStyle(category: EntityCategory): CategoryStyle {
  return CATEGORY_STYLES[category] ?? SLATE;
}

/** Legend entries (one per color) */
export const LEGEND: { label: string; swatch: string }[] = [
  { label: 'Diagnosis', swatch: ROSE.swatch },
  { label: 'Symptom/Sign', swatch: AMBER.swatch },
  { label: 'Medication', swatch: VIOLET.swatch },
  { label: 'Dose/Route/Freq', swatch: VIOLET_LIGHT.swatch },
  { label: 'Vital/Measurement', swatch: BLUE.swatch },
  { label: 'Test/Procedure', swatch: SKY.swatch },
  { label: 'Body structure', swatch: TEAL.swatch },
  { label: 'Allergen', swatch: ORANGE.swatch },
  { label: 'Time', swatch: CYAN.swatch },
  { label: 'Severity', swatch: FUCHSIA.swatch },
  { label: 'Other', swatch: SLATE.swatch },
  { label: 'PHI', swatch: PHI_STYLE.swatch },
];

/** Clinical display order for grouping entities */
export const CATEGORY_ORDER: EntityCategory[] = [
  'Diagnosis',
  'SymptomOrSign',
  'MedicationName',
  'Dosage',
  'MedicationRoute',
  'MedicationFrequency',
  'MedicationForm',
  'VitalSign',
  'MeasurementValue',
  'TestName',
  'ProcedureName',
  'BodyStructure',
  'Allergen',
  'Time',
  'Severity',
  'Other',
];

const CATEGORY_LABELS: Partial<Record<EntityCategory, string>> = {
  SymptomOrSign: 'Symptom or sign',
  MedicationName: 'Medication',
  MedicationRoute: 'Medication route',
  MedicationFrequency: 'Medication frequency',
  MedicationForm: 'Medication form',
  BodyStructure: 'Body structure',
  ProcedureName: 'Procedure',
  TestName: 'Test',
  MeasurementValue: 'Measurement',
  VitalSign: 'Vital sign',
};

export function categoryLabel(category: EntityCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

export type SourceKind = 'local' | 'provider' | 'both';

/** Whether an entity came from local detection, the provider, or both */
export function sourceKind(entity: MedicalEntity): SourceKind {
  const local = entity.sources.includes(LOCAL_ADAPTER_NAME);
  const provider = entity.sources.some((s) => s !== LOCAL_ADAPTER_NAME);
  if (local && provider) return 'both';
  return provider ? 'provider' : 'local';
}

export const SOURCE_BADGE: Record<SourceKind, string> = {
  local: 'L',
  provider: 'A',
  both: 'L+A',
};

export const SOURCE_BADGE_STYLE: Record<SourceKind, string> = {
  local: 'bg-slate-100 text-slate-600 border-slate-300',
  provider: 'bg-sky-50 text-sky-700 border-sky-300',
  both: 'bg-emerald-50 text-emerald-700 border-emerald-300',
};

export function sourcesLabel(entity: MedicalEntity): string {
  return entity.sources
    .map((s) => (s === LOCAL_ADAPTER_NAME ? 'local' : s === 'azure-health' ? 'Azure' : s))
    .join(' + ');
}

/** True when local and provider negation disagree */
export function isDisagreement(entity: MedicalEntity): boolean {
  return entity.negation?.agreement === false;
}

/** "local: yes · Azure: no" */
export function disagreementDetail(entity: MedicalEntity): string {
  const yn = (v: boolean | undefined) => (v === undefined ? 'n/a' : v ? 'yes' : 'no');
  return `negated? local: ${yn(entity.negation?.local)} · Azure: ${yn(entity.negation?.provider)}`;
}

/** Short pills for assertion values (negation is shown separately) */
export function assertionPills(entity: MedicalEntity): { label: string; title: string }[] {
  const a = entity.assertion;
  if (!a) return [];
  const pills: { label: string; title: string }[] = [];
  switch (a.certainty) {
    case 'positivePossible':
      pills.push({ label: 'possible', title: 'certainty: positivePossible' });
      break;
    case 'neutralPossible':
      pills.push({ label: 'uncertain', title: 'certainty: neutralPossible' });
      break;
    case 'negativePossible':
      pills.push({ label: 'possibly absent', title: 'certainty: negativePossible' });
      break;
    default:
      break;
  }
  if (a.conditionality) {
    pills.push({ label: a.conditionality, title: `conditionality: ${a.conditionality}` });
  }
  if (a.association === 'other') {
    pills.push({ label: 'family', title: 'association: other (not the patient)' });
  }
  return pills;
}

/** Assertion as one line for tooltips */
export function assertionText(entity: MedicalEntity): string | undefined {
  const a = entity.assertion;
  if (!a) return undefined;
  const parts = [a.certainty, a.conditionality, a.association].filter(Boolean);
  return parts.length ? parts.join(' / ') : undefined;
}

const PRIMARY_SYSTEMS = ['ICD10CM', 'SNOMEDCT_US', 'RXNORM'];

/** Codes split into the preferred systems (in that order) and the rest */
export function splitCodes(codes: OntologyCode[] | undefined): {
  primary: OntologyCode[];
  rest: OntologyCode[];
} {
  const all = codes ?? [];
  const primary = PRIMARY_SYSTEMS.flatMap((sys) => all.filter((c) => c.system === sys));
  const rest = all.filter((c) => !PRIMARY_SYSTEMS.includes(c.system));
  return { primary, rest };
}

/** "25 mg · oral · BID" from local medication attributes */
export function medicationAttributes(entity: MedicalEntity): string | undefined {
  if (entity.category !== 'MedicationName' || !entity.attributes) return undefined;
  const { dose, doseMax, unit, route, frequency } = entity.attributes as Record<string, unknown>;
  const parts: string[] = [];
  if (dose !== undefined) {
    const d = doseMax !== undefined ? `${String(dose)}-${String(doseMax)}` : String(dose);
    parts.push(unit !== undefined ? `${d} ${String(unit)}` : d);
  } else if (unit !== undefined) {
    parts.push(String(unit));
  }
  if (route !== undefined) parts.push(String(route));
  if (frequency !== undefined) parts.push(String(frequency));
  return parts.length ? parts.join(' · ') : undefined;
}

export function formatSectionType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
