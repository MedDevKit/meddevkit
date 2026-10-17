import { useState, useCallback } from 'react';
import Header from './components/Header';
import InputPanel, { type DemoView } from './components/InputPanel';
import AnalyzerSettingsPanel, { type RecordingNotice } from './components/AnalyzerSettings';
import AnalyzerView, { type EntityFocusRequest } from './components/AnalyzerView';
import AnalyzerSidePanel from './components/AnalyzerSidePanel';
import AnnotatedView from './components/AnnotatedView';
import ChunkCards from './components/ChunkCards';
import ComparisonPanel from './components/ComparisonPanel';
import SummaryBar from './components/SummaryBar';
import { useChunker, type ChunkerConfig } from './hooks/useChunker';
import { useComparison } from './hooks/useComparison';
import { useAnalyzer, type AnalyzerSettings } from './hooks/useAnalyzer';
import { PRESETS, type PresetKey } from './data/sample-notes';
import { AZURE_RECORDINGS } from './data/recordings';
import { hasRecordingFor } from './utils/replayAdapter';

const DEFAULT_CONFIG: ChunkerConfig = {
  maxTokens: 512,
  preserveVitals: true,
  phiDetection: true,
  detectNegations: true,
  preserveMedications: true,
  detectTemporal: true,
  detectSeverity: true,
};

const DEFAULT_PRESET: PresetKey = 'complex';

const DEFAULT_ANALYZER_SETTINGS: AnalyzerSettings = {
  provider: hasRecordingFor(AZURE_RECORDINGS, DEFAULT_PRESET) ? 'recorded' : 'local',
  endpoint: '',
  apiKey: '',
  phiPolicy: 'mask',
  negationPolicy: 'either',
};

export default function App() {
  const [activePreset, setActivePreset] = useState<PresetKey>(DEFAULT_PRESET);
  const [text, setText] = useState(PRESETS[DEFAULT_PRESET].note);
  const [config, setConfig] = useState<ChunkerConfig>(DEFAULT_CONFIG);
  const [view, setView] = useState<DemoView>('chunks');
  const [analyzerSettings, setAnalyzerSettings] = useState<AnalyzerSettings>(DEFAULT_ANALYZER_SETTINGS);
  const [focusRequest, setFocusRequest] = useState<EntityFocusRequest | null>(null);
  const compareMode = view === 'compare';
  const analyzerMode = view === 'analyzer';

  const { result, detections, error } = useChunker(text, config);
  const { naiveResult, brokenPatterns } = useComparison(
    compareMode ? text : '',
    config.maxTokens,
  );

  const analyzer = useAnalyzer(text, analyzerSettings, analyzerMode);

  const handlePresetChange = useCallback((key: PresetKey) => {
    setActivePreset(key);
    setText(PRESETS[key].note);
  }, []);

  const handleSelectEntity = useCallback((index: number) => {
    setFocusRequest((prev) => ({ index, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  let recordingNotice: RecordingNotice = 'none';
  if (analyzerSettings.provider === 'recorded') {
    if (AZURE_RECORDINGS.length === 0) {
      recordingNotice = 'no-recordings';
    } else if (
      analyzer.run?.mode === 'recorded' &&
      analyzer.run.analysis.metadata.providers.some((p) => p.status === 'failed')
    ) {
      recordingNotice = 'no-match';
    }
  }

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
            view={view}
            onViewChange={setView}
          >
            {analyzerMode && (
              <AnalyzerSettingsPanel
                settings={analyzerSettings}
                onChange={setAnalyzerSettings}
                canAnalyze={analyzer.canAnalyze}
                loading={analyzer.loading}
                onAnalyze={analyzer.analyze}
                recordingNotice={recordingNotice}
              />
            )}
          </InputPanel>
        </div>

        {analyzerMode ? (
          <>
            <div className="flex-1 border-r border-slate-200 bg-white overflow-hidden">
              <AnalyzerView
                run={analyzer.run}
                loading={analyzer.loading}
                error={analyzer.error}
                provider={analyzerSettings.provider}
                hasText={text.trim() !== ''}
                focusRequest={focusRequest}
              />
            </div>
            <div className="w-96 flex-shrink-0 bg-gray-50 overflow-hidden">
              <AnalyzerSidePanel
                run={analyzer.run}
                loading={analyzer.loading}
                provider={analyzerSettings.provider}
                config={config}
                onSelectEntity={handleSelectEntity}
              />
            </div>
          </>
        ) : compareMode ? (
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
        analyzerMode={analyzerMode}
        analysis={analyzer.run?.analysis}
      />
    </div>
  );
}
