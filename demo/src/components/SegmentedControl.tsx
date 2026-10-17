interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group */
  label: string;
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'xs';
}

/** Compact segmented control (radio group semantics) */
export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'sm',
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-md font-semibold transition-colors ${
              size === 'xs' ? 'py-1 text-[10px]' : 'py-1.5 text-xs'
            } ${
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
