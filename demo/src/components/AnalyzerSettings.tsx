import type { NegationPolicy } from '@meddevkit/chunker';
import type { AnalyzerProvider, AnalyzerSettings as Settings, DemoPhiPolicy } from '../hooks/useAnalyzer';
import SegmentedControl from './SegmentedControl';

export type RecordingNotice = 'none' | 'no-match' | 'no-recordings';

interface AnalyzerSettingsProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  canAnalyze: boolean;
  loading: boolean;
  onAnalyze: () => void;
  recordingNotice: RecordingNotice;
}

const PROVIDERS: { value: AnalyzerProvider; label: string }[] = [
  { value: 'local', label: 'Local only' },
  { value: 'recorded', label: 'Azure — recorded' },
  { value: 'live', label: 'Azure — live (your key)' },
];

const PHI_HELP: Record<DemoPhiPolicy, string> = {
  mask: 'Detected PHI is replaced with same-length masks before sending.',
  send: 'Text is sent unchanged, including any PHI.',
  block: 'Nothing is sent if any PHI is detected.',
};

const NEGATION_HELP: Record<NegationPolicy, string> = {
  either: 'Negated if local or provider says so.',
  provider: "Provider's opinion when present, else local.",
  local: 'Local negation detection only.',
};

export default function AnalyzerSettings({
  settings,
  onChange,
  canAnalyze,
  loading,
  onAnalyze,
  recordingNotice,
}: AnalyzerSettingsProps) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  const inputClass =
    'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent';

  return (
    <div className="px-4 py-3 border-t border-slate-200 bg-white space-y-3">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Analyzer</h2>

      <fieldset className="space-y-1.5">
        <legend className="text-xs text-slate-600 mb-1">Provider</legend>
        {PROVIDERS.map((p) => (
          <label key={p.value} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="analyzer-provider"
              value={p.value}
              checked={settings.provider === p.value}
              onChange={() => set('provider', p.value)}
              className="accent-emerald-600"
            />
            {p.label}
          </label>
        ))}
      </fieldset>

      {settings.provider === 'recorded' && recordingNotice !== 'none' && (
        <p className="text-[11px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          {recordingNotice === 'no-recordings' ? (
            <>
              No recordings yet — run{' '}
              <code className="font-mono">pnpm --filter @meddevkit/demo record:azure</code>.
            </>
          ) : (
            'No Azure recording for this text. Recordings exist for the sample notes; switch to Live or Local.'
          )}
        </p>
      )}

      <form
        autoComplete="off"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAnalyze && !loading) onAnalyze();
        }}
      >
        {settings.provider === 'live' && (
          <div className="space-y-2">
            <label className="block">
              <span className="block text-xs text-slate-600 mb-1">Endpoint</span>
              <input
                type="url"
                name="analyzer-endpoint"
                value={settings.endpoint}
                onChange={(e) => set('endpoint', e.target.value)}
                placeholder="https://<resource>.cognitiveservices.azure.com"
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="block text-xs text-slate-600 mb-1">Key</span>
              <input
                type="password"
                name="analyzer-resource-key"
                value={settings.apiKey}
                onChange={(e) => set('apiKey', e.target.value)}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                spellCheck={false}
                className={inputClass}
              />
            </label>
            <p className="text-[10px] leading-snug text-slate-500">
              Key stays in this tab's memory. It is never saved and is sent only to your endpoint. Use
              synthetic notes only.
            </p>
          </div>
        )}

        <div>
          <span className="block text-xs text-slate-600 mb-1">PHI policy</span>
          <SegmentedControl
            label="PHI policy"
            value={settings.phiPolicy}
            onChange={(v) => set('phiPolicy', v)}
            options={[
              { value: 'mask', label: 'Mask' },
              { value: 'send', label: 'Send' },
              { value: 'block', label: 'Block' },
            ]}
          />
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">{PHI_HELP[settings.phiPolicy]}</p>
        </div>

        <div>
          <span className="block text-xs text-slate-600 mb-1">Negation policy</span>
          <SegmentedControl
            label="Negation policy"
            value={settings.negationPolicy}
            onChange={(v) => set('negationPolicy', v)}
            options={[
              { value: 'either', label: 'Either' },
              { value: 'provider', label: 'Provider' },
              { value: 'local', label: 'Local' },
            ]}
          />
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
            {NEGATION_HELP[settings.negationPolicy]}
          </p>
        </div>

        <button
          type="submit"
          disabled={!canAnalyze || loading}
          className="w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 disabled:cursor-not-allowed"
        >
          {loading && settings.provider === 'live' ? 'Analyzing…' : 'Analyze'}
        </button>
      </form>
    </div>
  );
}
