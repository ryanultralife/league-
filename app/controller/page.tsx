'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore, battingSide } from '@/lib/store';
import { useHydratedStore, useWakeLock } from '@/lib/hooks';
import { connectRadar, bluetoothSupported, type RadarConnection } from '@/lib/bluetooth';
import { Stepper } from '@/components/Stepper';
import { sampleRgb } from '@/lib/vision';
import type { CalibrationPin } from '@/lib/types';

type Tab = 'score' | 'radar' | 'calibrate';

export default function ControllerPage() {
  useHydratedStore();
  useWakeLock(true);
  const [tab, setTab] = useState<Tab>('score');

  return (
    <main className="min-h-screen bg-broadcast pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-broadcast/95 px-4 py-3 backdrop-blur">
        <Link href="/" className="text-sm text-white/50">
          ← Home
        </Link>
        <h1 className="text-base font-bold">🎛️ Controller</h1>
        <SyncDot />
      </header>

      <div className="mx-auto max-w-lg px-4 py-5">
        {tab === 'score' && <ScoreTab />}
        {tab === 'radar' && <RadarTab />}
        {tab === 'calibrate' && <CalibrateTab />}
      </div>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-white/10 bg-broadcast/95 backdrop-blur">
        {(
          [
            ['score', '⚾', 'Scoreboard'],
            ['radar', '📡', 'Radar'],
            ['calibrate', '🎯', 'Calibrate'],
          ] as [Tab, string, string][]
        ).map(([t, icon, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`tap-target flex flex-col items-center gap-1 py-3 text-xs font-semibold ${
              tab === t ? 'text-accent' : 'text-white/50'
            }`}
          >
            <span className="text-xl">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}

function SyncDot() {
  const status = useGameStore((s) => s.syncStatus);
  const color =
    status === 'connected' ? 'bg-emerald-400' : status === 'local' ? 'bg-sky-400' : 'bg-amber-400';
  return <span className={`h-2.5 w-2.5 rounded-full ${color}`} />;
}

// -------------------------------------------------------------------------
// Scoreboard override
// -------------------------------------------------------------------------

function ScoreTab() {
  const s = useGameStore((st) => st.state.session);
  const store = useGameStore();
  const bat = battingSide(useGameStore((st) => st.state));

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200/80 ring-1 ring-amber-500/20">
        Manual taps override the computer-vision reading and push instantly to every device.
      </p>

      {/* Count */}
      <section className="grid grid-cols-3 gap-3 rounded-2xl bg-white/5 p-4">
        <Stepper
          label="Balls"
          value={s.balls}
          max={3}
          color="bg-emerald-500/20"
          onInc={() => store.setBalls(s.balls + 1)}
          onDec={() => store.setBalls(s.balls - 1)}
        />
        <Stepper
          label="Strikes"
          value={s.strikes}
          max={2}
          color="bg-yellow-500/20"
          onInc={() => store.setStrikes(s.strikes + 1)}
          onDec={() => store.setStrikes(s.strikes - 1)}
        />
        <Stepper
          label="Outs"
          value={s.outs}
          max={2}
          color="bg-red-500/20"
          onInc={() => store.bumpOut()}
          onDec={() => store.setOuts(s.outs - 1)}
        />
      </section>

      {/* Score */}
      <section className="grid grid-cols-2 gap-3 rounded-2xl bg-white/5 p-4">
        <Stepper
          label={s.guest_name}
          value={s.guest_score}
          onInc={() => store.addRun('guest', 1)}
          onDec={() => store.addRun('guest', -1)}
        />
        <Stepper
          label={s.home_name}
          value={s.home_score}
          onInc={() => store.addRun('home', 1)}
          onDec={() => store.addRun('home', -1)}
        />
      </section>

      {/* Inning + quick actions */}
      <section className="flex items-center justify-between rounded-2xl bg-white/5 p-4">
        <div className="text-sm">
          <div className="text-xs uppercase text-white/50">Inning</div>
          <div className="font-score text-2xl font-bold">
            {s.inning_half === 'top' ? '▲ Top' : '▼ Bot'} {s.inning}
          </div>
          <div className="text-xs text-white/40">Batting: {bat === 'home' ? s.home_name : s.guest_name}</div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => store.bumpOut()}
            className="tap-target rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold active:scale-95"
          >
            + Out / Flip half
          </button>
          <button
            onClick={() => store.clearCount()}
            className="tap-target rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold active:scale-95"
          >
            Clear B/S
          </button>
        </div>
      </section>

      {/* Bases */}
      <section className="rounded-2xl bg-white/5 p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-widest text-white/60">Runners</div>
        <div className="grid grid-cols-3 gap-3">
          {(['first', 'second', 'third'] as const).map((base) => (
            <button
              key={base}
              onClick={() => store.toggleBase(base)}
              className={`tap-target rounded-xl py-4 text-sm font-bold uppercase active:scale-95 ${
                s.bases[base] ? 'bg-accent text-broadcast' : 'bg-white/10 text-white/60'
              }`}
            >
              {base === 'first' ? '1st' : base === 'second' ? '2nd' : '3rd'}
            </button>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 p-4">
        <span className="text-xs uppercase text-white/50">Last radar</span>
        <span className="font-score text-3xl font-black text-accent">{s.current_speed || '—'}</span>
        <span className="text-sm text-white/50">mph</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Radar (Web Bluetooth)
// -------------------------------------------------------------------------

function RadarTab() {
  const setSpeed = useGameStore((s) => s.setSpeed);
  const speed = useGameStore((s) => s.state.session.current_speed);
  const [status, setStatus] = useState('Not connected');
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const connRef = useRef<RadarConnection | null>(null);
  const supported = bluetoothSupported();

  const onSpeed = useCallback(
    (mph: number) => {
      setSpeed(mph);
      setHistory((h) => [mph, ...h].slice(0, 8));
    },
    [setSpeed],
  );

  const connect = useCallback(async () => {
    try {
      setStatus('Requesting device…');
      connRef.current = await connectRadar(onSpeed, setStatus);
      setConnected(true);
    } catch (e: any) {
      setStatus(e?.message || 'Connection failed');
      setConnected(false);
    }
  }, [onSpeed]);

  const disconnect = useCallback(() => {
    connRef.current?.disconnect();
    connRef.current = null;
    setConnected(false);
    setStatus('Disconnected');
  }, []);

  useEffect(() => () => connRef.current?.disconnect(), []);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white/5 p-6 text-center">
        <div className="text-xs uppercase tracking-widest text-white/50">Current reading</div>
        <div className="font-score text-7xl font-black text-accent">{speed || '—'}</div>
        <div className="text-sm text-white/50">MPH</div>
      </div>

      {!supported ? (
        <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-500/20">
          Web Bluetooth isn&apos;t available in this browser. Use Chrome/Edge on Android or desktop
          over HTTPS. iOS Safari does not support Web Bluetooth.
        </p>
      ) : !connected ? (
        <button
          onClick={connect}
          className="tap-target w-full rounded-xl bg-sky-500 py-4 text-lg font-bold active:scale-95"
        >
          🔗 Connect Radar
        </button>
      ) : (
        <button
          onClick={disconnect}
          className="tap-target w-full rounded-xl bg-white/15 py-4 text-lg font-bold active:scale-95"
        >
          Disconnect
        </button>
      )}

      <p className="text-center text-sm text-white/60">{status}</p>
      <p className="text-center text-xs text-white/40">
        Scans for devices named “Pocket”, “Radar”, or “PR”.
      </p>

      {history.length > 0 && (
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="mb-2 text-xs uppercase text-white/50">Recent</div>
          <div className="flex flex-wrap gap-2">
            {history.map((h, i) => (
              <span
                key={i}
                className={`rounded-lg px-3 py-1 font-score text-sm ${
                  i === 0 ? 'bg-accent text-broadcast' : 'bg-white/10'
                }`}
              >
                {h}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Calibration
// -------------------------------------------------------------------------

const PIN_KINDS: { kind: CalibrationPin['kind']; label: string; needsSlot: boolean }[] = [
  { kind: 'ball', label: 'Ball', needsSlot: true },
  { kind: 'strike', label: 'Strike', needsSlot: true },
  { kind: 'out', label: 'Out', needsSlot: true },
  { kind: 'onbase', label: 'On base', needsSlot: true },
  { kind: 'ignore', label: 'Ignore', needsSlot: false },
];

function CalibrateTab() {
  const pins = useGameStore((s) => s.state.session.calibration_pins);
  const addPin = useGameStore((s) => s.addPin);
  const removePin = useGameStore((s) => s.removePin);
  const clearPins = useGameStore((s) => s.clearPins);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [camOn, setCamOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<CalibrationPin['kind']>('ball');
  const [slot, setSlot] = useState(1);

  const startCam = useCallback(async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamOn(true);
    } catch (e: any) {
      setErr(e?.message || 'Camera failed');
    }
  }, []);

  useEffect(
    () => () => {
      const src = videoRef.current?.srcObject as MediaStream | null;
      src?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const onTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!video || !canvas || !wrap || video.readyState < 2) return;
      const rect = wrap.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width;
      const yPct = (e.clientY - rect.top) / rect.height;

      // Sample the RGB at the tapped point from the current frame.
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const rgb = sampleRgb(data, w, h, xPct, yPct);

      addPin({
        id: `pin_${pins.length + 1}_${Math.round(xPct * 1000)}${Math.round(yPct * 1000)}`,
        label: `${kind}${PIN_KINDS.find((k) => k.kind === kind)?.needsSlot ? `-${slot}` : ''}`,
        xPct,
        yPct,
        rgb,
        kind,
        slot: PIN_KINDS.find((k) => k.kind === kind)?.needsSlot ? slot : undefined,
      });
    },
    [addPin, kind, slot, pins.length],
  );

  const activeKind = PIN_KINDS.find((k) => k.kind === kind);

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/60">
        Point the camera at the scoreboard, choose a pin type, and tap each light. We store the
        normalized position + the pixel&apos;s RGB so the stream phone can read it.
      </p>

      {!camOn ? (
        <button
          onClick={startCam}
          className="tap-target w-full rounded-xl bg-accent py-4 text-lg font-bold text-broadcast active:scale-95"
        >
          Start Calibration Camera
        </button>
      ) : (
        <>
          {/* Pin type selector */}
          <div className="flex flex-wrap gap-2">
            {PIN_KINDS.map((k) => (
              <button
                key={k.kind}
                onClick={() => setKind(k.kind)}
                className={`tap-target rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  kind === k.kind ? 'bg-accent text-broadcast' : 'bg-white/10 text-white/60'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          {activeKind?.needsSlot && (
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase text-white/50">Slot</span>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setSlot(n)}
                  disabled={kind === 'strike' && n === 3}
                  className={`tap-target h-9 w-9 rounded-lg font-bold ${
                    slot === n ? 'bg-accent text-broadcast' : 'bg-white/10'
                  } disabled:opacity-20`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {/* Live frame with pin overlay */}
          <div
            ref={wrapRef}
            onClick={onTap}
            className="relative aspect-video w-full overflow-hidden rounded-xl bg-black"
          >
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            {pins.map((p) => (
              <span
                key={p.id}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.xPct * 100}%`, top: `${p.yPct * 100}%` }}
              >
                <span
                  className="block h-4 w-4 rounded-full ring-2 ring-white"
                  style={{ background: `rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})` }}
                />
              </span>
            ))}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </>
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}

      {/* Pin list */}
      <div className="rounded-2xl bg-white/5 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase text-white/60">
            {pins.length} pin{pins.length === 1 ? '' : 's'}
          </span>
          {pins.length > 0 && (
            <button onClick={clearPins} className="text-xs text-red-400 underline">
              Clear all
            </button>
          )}
        </div>
        <div className="space-y-1">
          {pins.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full ring-1 ring-white/40"
                  style={{ background: `rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})` }}
                />
                <span className="font-mono">{p.label}</span>
                <span className="text-white/30">
                  {Math.round(p.xPct * 100)},{Math.round(p.yPct * 100)}
                </span>
              </span>
              <button onClick={() => removePin(p.id)} className="text-white/40 hover:text-red-400">
                ✕
              </button>
            </div>
          ))}
          {pins.length === 0 && <p className="text-sm text-white/30">No pins yet.</p>}
        </div>
      </div>
    </div>
  );
}
