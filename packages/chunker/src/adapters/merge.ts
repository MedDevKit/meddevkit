/**
 * Merging local and provider entities
 *
 * Pure functions: no I/O, no mutation of inputs.
 *
 * @packageDocumentation
 */

import type { ClinicalSection, NegationContext } from '../types';
import { getSectionAtPosition } from '../patterns';
import type {
  EntityAssertion,
  EntityCategory,
  EntityRelation,
  MedicalEntity,
  NegationPolicy,
  OntologyCode,
} from './types';
import { LOCAL_ADAPTER_NAME, overlapsNegation, rangesOverlap } from './LocalAdapter';

/**
 * Input to {@link mergeEntities}. All offsets must be in the same
 * coordinate space (the analyzed, normalized text).
 */
export interface MergeInput {
  /** Entities from the LocalAdapter */
  local: MedicalEntity[];
  /** Entities from the winning provider (already mapped to original offsets) */
  provider?: MedicalEntity[];
  /** Provider relations, `entityIndex` pointing into `provider` */
  relations?: EntityRelation[];
  /** Local negation spans */
  negations: NegationContext[];
  /** Local clinical sections */
  sections: ClinicalSection[];
  /** Negation resolution policy */
  negationPolicy: NegationPolicy;
}

/**
 * Output of {@link mergeEntities}.
 */
export interface MergeOutput {
  /** Final entities sorted by startOffset, then endOffset */
  entities: MedicalEntity[];
  /** Relations re-indexed into `entities` */
  relations: EntityRelation[];
  /** Number of final entities where local and provider negation disagree */
  negationDisagreements: number;
}

/** Provider categories that confirm a local vital sign */
const VITAL_MATCH_CATEGORIES: ReadonlySet<EntityCategory> = new Set([
  'VitalSign',
  'MeasurementValue',
  'TestName',
]);

/** Provider categories that confirm a local entity of the given category */
const MATCH_CATEGORIES: Partial<Record<EntityCategory, ReadonlySet<EntityCategory>>> = {
  VitalSign: VITAL_MATCH_CATEGORIES,
  MedicationName: new Set(['MedicationName']),
  Time: new Set(['Time']),
  Severity: new Set(['Severity']),
};

/** Internal: a final entity plus whether provider data contributed to it */
interface Draft {
  entity: MedicalEntity;
  /** Provider negation opinion; undefined when no provider data */
  providerNegated?: boolean;
}

/**
 * Provider negation opinion for one provider entity: its assertion
 * certainty when present (`negative` / `negativePossible` → true),
 * otherwise the entity's own `isNegated` flag.
 */
export function providerNegationOf(entity: MedicalEntity): boolean {
  const certainty = entity.assertion?.certainty;
  if (certainty !== undefined) {
    return certainty === 'negative' || certainty === 'negativePossible';
  }
  return entity.isNegated === true;
}

/**
 * Resolve the final negation flag from local and provider opinions.
 *
 * @param local - Entity overlaps a local negation span
 * @param provider - Provider opinion, or undefined when there is none
 */
export function resolveNegation(
  local: boolean,
  provider: boolean | undefined,
  policy: NegationPolicy
): { isNegated: boolean; agreement: boolean } {
  let isNegated: boolean;
  switch (policy) {
    case 'provider':
      isNegated = provider ?? local;
      break;
    case 'local':
      isNegated = local;
      break;
    case 'either':
    default:
      isNegated = local || provider === true;
      break;
  }
  return { isNegated, agreement: provider === undefined || local === provider };
}

/** Union two string lists, preserving order */
function unionStrings(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** Union two code lists, de-duplicated by system + code */
function unionCodes(
  a: OntologyCode[] | undefined,
  b: OntologyCode[] | undefined
): OntologyCode[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  const seen = new Set<string>();
  const out: OntologyCode[] = [];
  for (const code of [...(a ?? []), ...(b ?? [])]) {
    const key = `${code.system}\u0000${code.code}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ ...code });
    }
  }
  return out;
}

function cloneEntity(entity: MedicalEntity): MedicalEntity {
  return {
    ...entity,
    sources: [...entity.sources],
    ...(entity.codes ? { codes: entity.codes.map((c) => ({ ...c })) } : {}),
    ...(entity.assertion ? { assertion: { ...entity.assertion } } : {}),
    ...(entity.attributes ? { attributes: { ...entity.attributes } } : {}),
  };
}

/** Combine two provider negation opinions (either negative → negative) */
function combineProvider(
  current: boolean | undefined,
  next: boolean
): boolean {
  return current === undefined ? next : current || next;
}

/**
 * Keep the local entity (span, text, attributes, confidence) and absorb a
 * confirming provider entity: sources and codes are unioned; assertion and
 * normalizedText are taken from the provider when the local entity has
 * none.
 */
function absorbIntoLocal(draft: Draft, provider: MedicalEntity): void {
  const e = draft.entity;
  e.sources = unionStrings(e.sources, provider.sources);
  const codes = unionCodes(e.codes, provider.codes);
  if (codes) e.codes = codes;
  if (!e.assertion && provider.assertion) e.assertion = { ...provider.assertion };
  if (e.normalizedText === undefined && provider.normalizedText !== undefined) {
    e.normalizedText = provider.normalizedText;
  }
  draft.providerNegated = combineProvider(draft.providerNegated, providerNegationOf(provider));
}

/**
 * Merge a local medication with the provider's medication: provider span,
 * text, normalizedText, codes, assertion and providerCategory; local
 * attributes (dose/route/frequency) layered over provider attributes;
 * sources unioned; confidence is the max of both.
 */
function mergeMedication(local: MedicalEntity, provider: MedicalEntity): Draft {
  const assertion: EntityAssertion | undefined = provider.assertion
    ? { ...provider.assertion }
    : undefined;
  const attributes =
    provider.attributes || local.attributes
      ? { ...(provider.attributes ?? {}), ...(local.attributes ?? {}) }
      : undefined;
  const codes = unionCodes(provider.codes, undefined);
  const entity: MedicalEntity = {
    text: provider.text,
    category: 'MedicationName',
    startOffset: provider.startOffset,
    endOffset: provider.endOffset,
    confidence: Math.max(local.confidence, provider.confidence),
    isNegated: false,
    sources: unionStrings(local.sources, provider.sources),
    ...(provider.providerCategory !== undefined
      ? { providerCategory: provider.providerCategory }
      : {}),
    ...(provider.normalizedText !== undefined
      ? { normalizedText: provider.normalizedText }
      : {}),
    ...(codes ? { codes } : {}),
    ...(assertion ? { assertion } : {}),
    ...(attributes ? { attributes } : {}),
  };
  return { entity, providerNegated: providerNegationOf(provider) };
}

/**
 * Re-index relations through `indexMap` (old index → new index, or
 * undefined when the entity was dropped). A relation is dropped when any
 * role's entity was dropped, or when its roles referenced two or more
 * distinct entities that now collapse into a single entity.
 */
export function remapRelations(
  relations: EntityRelation[],
  indexMap: ReadonlyArray<number | undefined>
): EntityRelation[] {
  const out: EntityRelation[] = [];
  for (const relation of relations) {
    const roles: EntityRelation['roles'] = [];
    let dropped = false;
    for (const role of relation.roles) {
      const mapped = Number.isInteger(role.entityIndex)
        ? indexMap[role.entityIndex]
        : undefined;
      if (mapped === undefined) {
        dropped = true;
        break;
      }
      roles.push({ role: role.role, entityIndex: mapped });
    }
    if (dropped) continue;
    const before = new Set(relation.roles.map((r) => r.entityIndex)).size;
    const after = new Set(roles.map((r) => r.entityIndex)).size;
    if (before >= 2 && after < 2) continue;
    out.push({ ...relation, roles });
  }
  return out;
}

/**
 * Merge local entities with provider entities.
 *
 * Rules:
 * - Provider-owned categories (Diagnosis, SymptomOrSign, ProcedureName,
 *   BodyStructure, TestName, Allergen, Dosage, ...) are taken from the
 *   provider as-is.
 * - Local VitalSign + overlapping provider VitalSign/MeasurementValue/
 *   TestName: one entity — local span and attributes, plus provider codes
 *   and sources.
 * - Local MedicationName + overlapping provider MedicationName: one entity
 *   — provider span/text/normalizedText/codes/assertion, local attributes,
 *   union of sources, max confidence. Unmatched meds on either side are
 *   kept.
 * - Local Time/Severity + overlapping provider Time/Severity: local entity
 *   with sources (and codes) merged; otherwise kept as-is.
 * - Each provider entity is consumed by at most one local entity.
 * - Negation, section and sort order are (re)computed for every final
 *   entity; provider relations are re-indexed.
 */
export function mergeEntities(input: MergeInput): MergeOutput {
  const provider = input.provider ?? [];
  const consumed: (Draft | undefined)[] = new Array(provider.length).fill(undefined);
  const drafts: Draft[] = [];

  for (const localEntity of input.local) {
    const matchCategories = MATCH_CATEGORIES[localEntity.category];
    const matches: number[] = [];
    if (matchCategories) {
      provider.forEach((p, i) => {
        if (
          consumed[i] === undefined &&
          matchCategories.has(p.category) &&
          rangesOverlap(localEntity.startOffset, localEntity.endOffset, p.startOffset, p.endOffset)
        ) {
          matches.push(i);
        }
      });
    }

    if (matches.length === 0) {
      drafts.push({ entity: cloneEntity(localEntity) });
      continue;
    }

    if (localEntity.category === 'MedicationName') {
      // One provider medication per local medication: the first by position
      const first = matches.reduce((best, i) =>
        provider[i].startOffset < provider[best].startOffset ? i : best
      );
      const draft = mergeMedication(localEntity, provider[first]);
      consumed[first] = draft;
      drafts.push(draft);
      continue;
    }

    // VitalSign / Time / Severity: keep local, absorb every confirming match
    const draft: Draft = { entity: cloneEntity(localEntity) };
    for (const i of matches) {
      absorbIntoLocal(draft, provider[i]);
      consumed[i] = draft;
    }
    drafts.push(draft);
  }

  provider.forEach((p, i) => {
    if (consumed[i] === undefined) {
      const draft: Draft = { entity: cloneEntity(p), providerNegated: providerNegationOf(p) };
      consumed[i] = draft;
      drafts.push(draft);
    }
  });

  // Negation + section for every final entity
  let negationDisagreements = 0;
  for (const draft of drafts) {
    const e = draft.entity;
    const hasProviderData = e.sources.some((s) => s !== LOCAL_ADAPTER_NAME);
    const providerOpinion = hasProviderData ? draft.providerNegated : undefined;
    // Provider concepts may include the cue ("no acute distress"): ignore
    // a negation whose cue lies inside such an entity
    const local = overlapsNegation(e.startOffset, e.endOffset, input.negations, {
      ignoreCueInside: hasProviderData,
    });
    const { isNegated, agreement } = resolveNegation(local, providerOpinion, input.negationPolicy);
    e.isNegated = isNegated;
    e.negation =
      providerOpinion === undefined
        ? { local, agreement }
        : { local, provider: providerOpinion, agreement };
    if (!agreement) negationDisagreements++;

    const section = getSectionAtPosition(input.sections, e.startOffset)?.type;
    if (section) e.section = section;
    else delete e.section;
  }

  const sorted = [...drafts].sort(
    (a, b) =>
      a.entity.startOffset - b.entity.startOffset ||
      a.entity.endOffset - b.entity.endOffset
  );
  const finalIndex = new Map<Draft, number>(sorted.map((d, i) => [d, i]));
  const indexMap = consumed.map((d) => (d ? finalIndex.get(d) : undefined));

  return {
    entities: sorted.map((d) => d.entity),
    relations: remapRelations(input.relations ?? [], indexMap),
    negationDisagreements,
  };
}
