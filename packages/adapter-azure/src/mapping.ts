/**
 * Mapping Text Analytics for health output onto MedDevKit's
 * provider-neutral entity model
 *
 * @packageDocumentation
 */

import type { EntityAssertion, EntityCategory, MedicalEntity } from '@meddevkit/chunker';
import type { AzureHealthcareEntity } from './azure-types';

/**
 * Azure healthcare entity category → MedDevKit {@link EntityCategory}.
 * Categories not listed map to `'Other'`; the Azure name is always kept in
 * `MedicalEntity.providerCategory`.
 */
export const AZURE_CATEGORY_MAP: Readonly<Record<string, EntityCategory>> = {
  Diagnosis: 'Diagnosis',
  SymptomOrSign: 'SymptomOrSign',
  MedicationName: 'MedicationName',
  MedicationClass: 'MedicationName',
  Dosage: 'Dosage',
  MedicationRoute: 'MedicationRoute',
  MedicationForm: 'MedicationForm',
  Frequency: 'MedicationFrequency',
  BodyStructure: 'BodyStructure',
  TreatmentName: 'ProcedureName',
  ExaminationName: 'TestName',
  MeasurementValue: 'MeasurementValue',
  Time: 'Time',
  Date: 'Time',
  ConditionQualifier: 'Severity',
  ConditionScale: 'Severity',
  Allergen: 'Allergen',
};

/**
 * Map an Azure category name to a MedDevKit category.
 */
export function mapAzureCategory(azureCategory: string): EntityCategory {
  return Object.prototype.hasOwnProperty.call(AZURE_CATEGORY_MAP, azureCategory)
    ? AZURE_CATEGORY_MAP[azureCategory]
    : 'Other';
}

/**
 * Map one Azure entity to a {@link MedicalEntity}.
 *
 * @param entity - Azure entity
 * @param baseOffset - Offset of the entity's document in the analyzed text
 * @param source - Adapter name recorded in `sources`
 */
export function mapAzureEntity(
  entity: AzureHealthcareEntity,
  baseOffset: number,
  source: string
): MedicalEntity {
  const start = baseOffset + entity.offset;
  const a = entity.assertion;
  const assertion: EntityAssertion = {};
  if (a?.certainty) assertion.certainty = a.certainty;
  if (a?.conditionality) assertion.conditionality = a.conditionality;
  if (a?.association) assertion.association = a.association;

  const attributes: Record<string, unknown> = {};
  if (a?.temporality) attributes.temporality = a.temporality;
  if (entity.subcategory) attributes.subcategory = entity.subcategory;

  const codes = (entity.links ?? []).map((l) => ({ system: l.dataSource, code: l.id }));

  return {
    text: entity.text,
    category: mapAzureCategory(entity.category),
    providerCategory: entity.category,
    startOffset: start,
    endOffset: start + entity.length,
    confidence: typeof entity.confidenceScore === 'number' ? entity.confidenceScore : 0,
    isNegated: a?.certainty === 'negative' || a?.certainty === 'negativePossible',
    ...(Object.keys(assertion).length ? { assertion } : {}),
    ...(codes.length ? { codes } : {}),
    ...(entity.name ? { normalizedText: entity.name } : {}),
    sources: [source],
    ...(Object.keys(attributes).length ? { attributes } : {}),
  };
}

const REF_PATTERN = /^#\/results\/documents\/(\d+)\/entities\/(\d+)$/;

/**
 * Parse a relation entity reference such as
 * `#/results/documents/0/entities/3` into document and entity indexes.
 * Returns undefined for anything else.
 */
export function parseEntityRef(ref: string): { document: number; entity: number } | undefined {
  const m = REF_PATTERN.exec(ref);
  if (!m) return undefined;
  return { document: Number(m[1]), entity: Number(m[2]) };
}
