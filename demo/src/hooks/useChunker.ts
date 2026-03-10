import { useMemo } from 'react';
import {
  MedicalChunker,
  detectVitals,
  detectPhi,
  detectSections,
  detectNegations,
  type ChunkingResult,
  type VitalSign,
  type PhiMarker,
  type ClinicalSection,
  type NegationContext,
} from '@meddevkit/chunker';

export interface ChunkerConfig {
  maxTokens: number;
  preserveVitals: boolean;
  phiDetection: boolean;
  detectNegations: boolean;
}

export interface DetectionResults {
  vitals: VitalSign[];
  phi: PhiMarker[];
  sections: ClinicalSection[];
  negations: NegationContext[];
}

export interface ChunkerOutput {
  result: ChunkingResult | null;
  detections: DetectionResults;
  error: string | null;
}

export function useChunker(text: string, config: ChunkerConfig): ChunkerOutput {
  return useMemo(() => {
    if (!text.trim()) {
      return {
        result: null,
        detections: { vitals: [], phi: [], sections: [], negations: [] },
        error: null,
      };
    }

    try {
      const chunker = new MedicalChunker({
        maxTokens: config.maxTokens,
        preserveVitals: config.preserveVitals,
        phiDetection: config.phiDetection ? 'basic' : 'none',
        detectNegations: config.detectNegations,
        preserveSections: true,
        preserveSentences: true,
      });

      const result = chunker.chunk(text);

      const detections: DetectionResults = {
        vitals: detectVitals(text),
        phi: config.phiDetection ? detectPhi(text) : [],
        sections: detectSections(text),
        negations: config.detectNegations ? detectNegations(text) : [],
      };

      return { result, detections, error: null };
    } catch (e) {
      return {
        result: null,
        detections: { vitals: [], phi: [], sections: [], negations: [] },
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  }, [text, config.maxTokens, config.preserveVitals, config.phiDetection, config.detectNegations]);
}
