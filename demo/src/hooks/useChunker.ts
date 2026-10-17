import { useMemo } from 'react';
import {
  MedicalChunker,
  detectVitals,
  detectPhi,
  detectSections,
  detectNegations,
  detectMedications,
  detectTemporal,
  detectSeverity,
  type ChunkingResult,
  type MedicalChunkerConfig,
  type VitalSign,
  type PhiMarker,
  type ClinicalSection,
  type NegationContext,
  type MedicationMention,
  type TemporalExpression,
  type SeverityModifier,
} from '@meddevkit/chunker';

export interface ChunkerConfig {
  maxTokens: number;
  preserveVitals: boolean;
  phiDetection: boolean;
  detectNegations: boolean;
  preserveMedications: boolean;
  detectTemporal: boolean;
  detectSeverity: boolean;
}

export interface DetectionResults {
  vitals: VitalSign[];
  phi: PhiMarker[];
  sections: ClinicalSection[];
  negations: NegationContext[];
  medications: MedicationMention[];
  temporal: TemporalExpression[];
  severity: SeverityModifier[];
}

const EMPTY_DETECTIONS: DetectionResults = {
  vitals: [],
  phi: [],
  sections: [],
  negations: [],
  medications: [],
  temporal: [],
  severity: [],
};

export interface ChunkerOutput {
  result: ChunkingResult | null;
  detections: DetectionResults;
  error: string | null;
}

/** MedicalChunker options for the demo's chunker settings */
export function toChunkerOptions(config: ChunkerConfig): MedicalChunkerConfig {
  return {
    maxTokens: config.maxTokens,
    preserveVitals: config.preserveVitals,
    phiDetection: config.phiDetection ? 'basic' : 'none',
    detectNegations: config.detectNegations,
    preserveMedications: config.preserveMedications,
    detectTemporal: config.detectTemporal,
    detectSeverity: config.detectSeverity,
    preserveSections: true,
    preserveSentences: true,
  };
}

export function useChunker(text: string, config: ChunkerConfig): ChunkerOutput {
  return useMemo(() => {
    if (!text.trim()) {
      return {
        result: null,
        detections: EMPTY_DETECTIONS,
        error: null,
      };
    }

    try {
      const chunker = new MedicalChunker(toChunkerOptions(config));

      const result = chunker.chunk(text);

      const detections: DetectionResults = {
        vitals: detectVitals(text),
        phi: config.phiDetection ? detectPhi(text) : [],
        sections: detectSections(text),
        negations: config.detectNegations ? detectNegations(text) : [],
        medications: config.preserveMedications ? detectMedications(text) : [],
        temporal: config.detectTemporal ? detectTemporal(text) : [],
        severity: config.detectSeverity ? detectSeverity(text) : [],
      };

      return { result, detections, error: null };
    } catch (e) {
      return {
        result: null,
        detections: EMPTY_DETECTIONS,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  }, [
    text,
    config.maxTokens,
    config.preserveVitals,
    config.phiDetection,
    config.detectNegations,
    config.preserveMedications,
    config.detectTemporal,
    config.detectSeverity,
  ]);
}
