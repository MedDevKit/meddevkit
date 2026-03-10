import { PRESETS, type PresetKey } from '../data/sample-notes';
import type { ChunkerConfig } from '../hooks/useChunker';

interface InputPanelProps {
  text: string;
  onTextChange: (text: string) => void;
  activePreset: PresetKey;
  onPresetChange: (key: PresetKey) => void;
  config: ChunkerConfig;
  onConfigChange: (config: ChunkerConfig) => void;
  compareMode: boolean;
  onCompareToggle: (v: boolean) => void;
}

const presetKeys = Object.keys(PRESETS) as PresetKey[];

export default function InputPanel({
  text,
  onTextChange,
  activePreset,
  onPresetChange,
  config,
  onConfigChange,
  compareMode,
  onCompareToggle,
}: InputPanelProps) {
  const handleCompareToggle = () => {
    const next = !compareMode;
    onCompareToggle(next);
  };
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Input
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {presetKeys.map((key) => (
            <button
              key={key}
              onClick={() => onPresetChange(key)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                activePreset === key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title={PRESETS[key].description}
            >
              {PRESETS[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4">
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          className="w-full h-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          placeholder="Paste a clinical note here..."
          spellCheck={false}
        />
      </div>

      <div className="px-4 py-3 border-t border-slate-200 bg-white space-y-3">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Config</h2>

        <div>
          <label className="flex items-center justify-between text-xs text-slate-600 mb-1">
            <span>Max Tokens</span>
            <span className="font-mono font-semibold text-slate-900">{config.maxTokens}</span>
          </label>
          <input
            type="range"
            min={128}
            max={2048}
            step={64}
            value={config.maxTokens}
            onChange={(e) =>
              onConfigChange({ ...config, maxTokens: parseInt(e.target.value) })
            }
            className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-emerald-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
            <span>128</span>
            <span>2048</span>
          </div>
        </div>

        <div className="space-y-2">
          <Toggle
            label="Preserve Vitals"
            checked={config.preserveVitals}
            onChange={(v) => onConfigChange({ ...config, preserveVitals: v })}
            color="blue"
          />
          <Toggle
            label="PHI Detection"
            checked={config.phiDetection}
            onChange={(v) => onConfigChange({ ...config, phiDetection: v })}
            color="red"
          />
          <Toggle
            label="Negation Detection"
            checked={config.detectNegations}
            onChange={(v) => onConfigChange({ ...config, detectNegations: v })}
            color="amber"
          />
        </div>

        <button
          onClick={handleCompareToggle}
          className={`w-full mt-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
            compareMode
              ? 'bg-gradient-to-r from-orange-500 to-emerald-500 text-white shadow-md'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
          }`}
        >
          {compareMode ? 'Comparison ON' : 'Compare vs Generic'}
        </button>
        {compareMode && config.maxTokens > 256 && (
          <p className="text-[10px] text-amber-600 mt-1">
            Tip: Try 128 tokens for a more dramatic comparison
          </p>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  color,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  color: 'blue' | 'red' | 'amber';
}) {
  const colorMap = {
    blue: 'bg-blue-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
  };

  return (
    <label className="flex items-center justify-between cursor-pointer" onClick={() => onChange(!checked)}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${checked ? colorMap[color] : 'bg-slate-300'}`} />
        <span className="text-xs text-slate-600">{label}</span>
      </div>
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
    </label>
  );
}
