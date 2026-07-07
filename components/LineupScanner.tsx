'use client';

import { useCallback, useRef, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { parseLineupText, POSITION_BY_NUMBER, type ParsedPlayer } from '@/lib/lineupParse';
import type { DefensivePosition, Player, TeamSide } from '@/lib/types';

const POSITIONS: DefensivePosition[] = [
  'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'BN',
];

type Phase = 'idle' | 'reading' | 'review' | 'error';

/**
 * Scan a photo of a paper lineup card and turn it into the roster. OCR runs
 * fully on-device in a Tesseract Web Worker — the image never leaves the phone.
 * Positions written as scorekeeping numbers (1-9) are mapped to defensive
 * positions; results are shown in an editable table before anything is applied.
 */
export function LineupScanner({ side }: { side: TeamSide }) {
  const setRoster = useGameStore((s) => s.setRoster);
  const roster = useGameStore((s) => s.state.lineups[side]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<ParsedPlayer[]>([]);
  const [replace, setReplace] = useState(true);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  /** Downscale + grayscale + contrast-stretch to help OCR, return a data URL. */
  const preprocess = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        // Grayscale + simple contrast stretch.
        for (let i = 0; i < d.length; i += 4) {
          const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const c = Math.max(0, Math.min(255, (g - 128) * 1.4 + 128));
          d[i] = d[i + 1] = d[i + 2] = c;
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-picking the same file
      if (!file) return;
      setPhase('reading');
      setProgress(0);
      setError('');
      try {
        const dataUrl = await preprocess(file);
        // Load the OCR engine on demand (separate chunk). The image is
        // recognized locally in the worker; nothing is uploaded.
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng', 1, {
          logger: (m: { status: string; progress: number }) => {
            if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
          },
        });
        try {
          const {
            data: { text },
          } = await worker.recognize(dataUrl);
          const parsed = parseLineupText(text);
          if (parsed.length === 0) {
            setError(
              'No players detected. Try a straighter, well-lit photo that fills the frame.',
            );
            setPhase('error');
          } else {
            setRows(parsed);
            setPhase('review');
          }
        } finally {
          await worker.terminate();
        }
      } catch (err: any) {
        setError(err?.message || 'OCR failed. Check your connection and try again.');
        setPhase('error');
      }
    },
    [preprocess],
  );

  const updateRow = (i: number, patch: Partial<ParsedPlayer>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const apply = useCallback(() => {
    const stamp = Math.round(performance.now());
    const players: Player[] = rows.map((r, i) => ({
      id: `${side}-scan-${stamp}-${i}`,
      name: r.name,
      jersey_number: r.jersey_number,
      batting_order_position: r.batting_order_position,
      defensive_position: r.defensive_position,
      is_at_bat: false,
      ab: 0,
      hits: 0,
      rbi: 0,
    }));
    const next = replace ? players : [...roster, ...players];
    // Keep a batter flagged so the overlay always has an "at bat".
    if (!next.some((p) => p.is_at_bat) && next.length) {
      const lead =
        next.find((p) => p.batting_order_position === 1) ?? next[0];
      lead.is_at_bat = true;
    }
    setRoster(side, next);
    setPhase('idle');
    setRows([]);
  }, [rows, replace, roster, side, setRoster]);

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="tap-target flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-semibold active:scale-95"
      >
        📷 Scan lineup card
      </button>

      {phase === 'reading' && (
        <div className="mt-3 rounded-xl bg-white/5 p-4 text-center text-sm">
          <p className="mb-2 text-white/70">Reading card on-device… {progress}%</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-white/40">
            First scan downloads the OCR engine, then it&apos;s cached.
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-500/20">
          {error}
        </div>
      )}

      {phase === 'review' && (
        <div className="mt-3 rounded-xl bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-white/60">
              Review scan · {rows.length} players
            </span>
            <button
              onClick={() => {
                setPhase('idle');
                setRows([]);
              }}
              className="text-xs text-white/40 underline"
            >
              Cancel
            </button>
          </div>
          <p className="mb-3 text-xs text-white/40">
            Fix anything the scan got wrong. Position was read from scorekeeping numbers
            (1=P, 2=C, 3=1B, 4=2B, 5=3B, 6=SS, 7=LF, 8=CF, 9=RF).
          </p>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={r.batting_order_position || ''}
                  onChange={(e) =>
                    updateRow(i, {
                      batting_order_position: Math.max(0, Math.min(9, parseInt(e.target.value || '0', 10) || 0)),
                    })
                  }
                  className="h-9 w-8 rounded bg-black/30 text-center font-score text-sm ring-1 ring-white/10 focus:outline-none focus:ring-accent"
                  title="Batting order"
                />
                <input
                  value={r.jersey_number}
                  onChange={(e) => updateRow(i, { jersey_number: e.target.value.slice(0, 3) })}
                  className="h-9 w-11 rounded bg-black/30 text-center font-score text-sm ring-1 ring-white/10 focus:outline-none focus:ring-accent"
                  placeholder="##"
                  title="Jersey number"
                />
                <input
                  value={r.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  className="h-9 min-w-0 flex-1 rounded bg-black/30 px-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-accent"
                  placeholder="Name"
                />
                <select
                  value={r.defensive_position}
                  onChange={(e) => updateRow(i, { defensive_position: e.target.value as DefensivePosition })}
                  className="h-9 rounded bg-black/30 px-1 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-accent"
                  title="Position"
                >
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removeRow(i)}
                  className="px-1 text-white/40 hover:text-red-400"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Replace the current {side === 'home' ? 'home' : 'away'} roster (uncheck to append)
          </label>

          <button
            onClick={apply}
            className="tap-target mt-3 w-full rounded-xl bg-accent py-3 text-sm font-bold text-broadcast active:scale-95"
          >
            Apply {rows.length} players
          </button>
        </div>
      )}
    </div>
  );
}
