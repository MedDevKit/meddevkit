import { useState, useCallback } from 'react';
import Header from './components/Header';
import InputPanel from './components/InputPanel';
import AnnotatedView from './components/AnnotatedView';
import ChunkCards from './components/ChunkCards';
import ComparisonPanel from './components/ComparisonPanel';
import SummaryBar from './components/SummaryBar';
import { useChunker, type ChunkerConfig } from './hooks/useChunker';
import { useComparison } from './hooks/useComparison';
import { PRESETS, type PresetKey } from './data/sample-notes';

const DEFAULT_CONFIG: ChunkerConfig = {
  maxTokens: 512,
  preserveVitals: true,
  phiDetection: true,
  detectNegations: true,
};

export default function App() {
  const [activePreset, setActivePreset] = useState<PresetKey>('complex');
  const [text, setText] = useState(PRESETS.complex.note);
  const [config, setConfig] = useState<ChunkerConfig>(DEFAULT_CONFIG);
  const [compareMode, setCompareMode] = useState(false);

  const { result, detections, error } = useChunker(text, config);
  const { naiveResult, brokenPatterns } = useComparison(
    compareMode ? text : '',
    config.maxTokens,
  );

  const handlePresetChange = useCallback((key: PresetKey) => {
    setActivePreset(key);
    setText(PRESETS[key].note);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header />

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      <main className="flex-1 flex overflow-hidden">
        {/* Input Panel */}
        <div className="w-72 flex-shrink-0 border-r border-slate-200 bg-gray-50 overflow-auto">
          <InputPanel
            text={text}
            onTextChange={setText}
            activePreset={activePreset}
            onPresetChange={handlePresetChange}
            config={config}
            onConfigChange={setConfig}
            compareMode={compareMode}
            onCompareToggle={setCompareMode}
          />
        </div>

        {compareMode ? (
          /* Comparison View */
          <div className="flex-1 overflow-hidden">
            <ComparisonPanel
              result={result}
              naiveResult={naiveResult}
              brokenPatterns={brokenPatterns}
            />
          </div>
        ) : (
          <>
            {/* Annotated View */}
            <div className="flex-1 border-r border-slate-200 bg-white overflow-hidden">
              <AnnotatedView
                text={text}
                detections={detections}
                config={config}
              />
            </div>

            {/* Chunk Cards */}
            <div className="w-96 flex-shrink-0 bg-gray-50 overflow-hidden">
              <ChunkCards result={result} />
            </div>
          </>
        )}
      </main>

      <SummaryBar
        result={result}
        detections={detections}
        compareMode={compareMode}
        naiveResult={naiveResult}
        brokenPatterns={brokenPatterns}
      />
    </div>
  );
}
