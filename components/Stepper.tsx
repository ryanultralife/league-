'use client';

/** High-visibility touch stepper for count/score fields. */
export function Stepper({
  label,
  value,
  onDec,
  onInc,
  color = 'bg-white/10',
  max,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
  color?: string;
  max?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-widest text-white/60">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onDec}
          className="tap-target flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-3xl font-black active:scale-90"
        >
          −
        </button>
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-2xl ${color} font-score text-4xl font-black tabular-nums`}
        >
          {value}
        </div>
        <button
          onClick={onInc}
          disabled={max !== undefined && value >= max}
          className="tap-target flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-3xl font-black text-broadcast active:scale-90 disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}
