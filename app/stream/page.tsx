'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { useHydratedStore, useWakeLock } from '@/lib/hooks';
import { BroadcastOverlay } from '@/components/Overlay';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { readState, COLOR_DELTA_THRESHOLD } from '@/lib/vision';
import { drawOverlay } from '@/lib/overlayCanvas';
import { startWhip, startRecording, type WhipSession, type Recorder } from '@/lib/streaming';
import { SYNC_MODE } from '@/lib/sync';

const WATCH_FPS = 5;

export default function StreamPage() {
  useHydratedStore();
  useWakeLock(true);

  const applyVision = useGameStore((s) => s.applyVision);
  const pins = useGameStore((s) => s.state.session.calibration_pins);
  const rev = useGameStore((s) => s.state.rev);

  const videoRef = useRef<HTMLVideoElement>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null); // hidden CV sampler
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null); // outgoing frame

  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(true);
  const [live, setLive] = useState(false);
  const [recordUrl, setRecordUrl] = useState<string | null>(null);
  const [whipUrl, setWhipUrl] = useState('');
  const [whipToken, setWhipToken] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [showControls, setShowControls] = useState(true);

  const whipRef = useRef<WhipSession | null>(null);
  const recRef = useRef<Recorder | null>(null);
  const rafRef = useRef<number | null>(null);

  // Keep a live ref to the game state for the compositing loop without
  // re-subscribing every render.
  const stateRef = useRef(useGameStore.getState().state);
  useEffect(() => useGameStore.subscribe((s) => (stateRef.current = s.state)), []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access and reload.'
          : `Could not start camera: ${e?.message || e}`,
      );
    }
  }, []);

  // ---- Pixel watcher loop (5 FPS) ----
  useEffect(() => {
    if (!cameraOn || !watching) return;
    let stop = false;
    const interval = window.setInterval(() => {
      if (stop) return;
      const video = videoRef.current;
      const canvas = sampleCanvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const w = 320; // downscale for cheap sampling
      const h = Math.round((video.videoHeight / video.videoWidth) * w) || 180;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const currentPins = useGameStore.getState().state.session.calibration_pins;
      if (currentPins.length === 0) return;
      const { data } = ctx.getImageData(0, 0, w, h);
      const reading = readState(currentPins, data, w, h, COLOR_DELTA_THRESHOLD);
      applyVision(reading);
    }, 1000 / WATCH_FPS);
    return () => {
      stop = true;
      window.clearInterval(interval);
    };
  }, [cameraOn, watching, applyVision]);

  // ---- Compositing loop: draw camera + overlay onto the outgoing canvas ----
  const startCompositing = useCallback((): MediaStream | null => {
    const video = videoRef.current;
    const canvas = compositeCanvasRef.current;
    if (!video || !canvas) return null;
    const W = video.videoWidth || 1280;
    const H = video.videoHeight || 720;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const render = () => {
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, W, H);
        try {
          drawOverlay(ctx, W, H, stateRef.current);
        } catch {
          /* draw errors shouldn't kill the stream */
        }
      }
      rafRef.current = requestAnimationFrame(render);
    };
    render();

    const canvasStream = canvas.captureStream(30);
    // Mux in the mic/ambient audio track from the camera stream if present.
    const src = video.srcObject as MediaStream | null;
    src?.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
    return canvasStream;
  }, []);

  const stopCompositing = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const goLive = useCallback(async () => {
    setStatusMsg('');
    setRecordUrl(null);
    const composite = startCompositing();
    if (!composite) {
      setStatusMsg('Start the camera first.');
      return;
    }
    setLive(true);
    if (whipUrl.trim()) {
      try {
        setStatusMsg('Negotiating WebRTC (WHIP)…');
        whipRef.current = await startWhip(composite, whipUrl.trim(), whipToken.trim() || undefined);
        setStatusMsg('🔴 Live via WHIP');
      } catch (e: any) {
        setStatusMsg(`WHIP failed (${e?.message}). Recording locally instead.`);
        recRef.current = startRecording(composite, (url) => setRecordUrl(url));
      }
    } else {
      setStatusMsg('🔴 Recording locally (no WHIP endpoint set)');
      recRef.current = startRecording(composite, (url) => setRecordUrl(url));
    }
  }, [startCompositing, whipUrl, whipToken]);

  const stopLive = useCallback(async () => {
    setLive(false);
    await whipRef.current?.stop().catch(() => {});
    whipRef.current = null;
    recRef.current?.stop();
    recRef.current = null;
    stopCompositing();
    setStatusMsg('Stopped.');
  }, [stopCompositing]);

  useEffect(() => {
    return () => {
      stopCompositing();
      whipRef.current?.stop().catch(() => {});
      recRef.current?.stop();
      const src = videoRef.current?.srcObject as MediaStream | null;
      src?.getTracks().forEach((t) => t.stop());
    };
  }, [stopCompositing]);

  return (
    <main className="no-scroll bg-black">
      {/* Camera background */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Broadcast overlay (operator monitor). Isolated so a render error in
          the overlay can never take down the camera or the outgoing stream;
          it auto-recovers on the next state update. */}
      {cameraOn && (
        <ErrorBoundary label="overlay" resetKey={rev}>
          <BroadcastOverlay />
        </ErrorBoundary>
      )}

      {/* Hidden canvases */}
      <canvas ref={sampleCanvasRef} className="hidden" />
      <canvas ref={compositeCanvasRef} className="hidden" />

      {/* Tap anywhere to toggle the control panel */}
      <button
        aria-label="Toggle controls"
        onClick={() => setShowControls((v) => !v)}
        className="absolute inset-0 z-10"
        style={{ background: 'transparent' }}
      />

      {/* Start prompt */}
      {!cameraOn && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="text-5xl">📹</span>
          <h1 className="text-xl font-bold">Hanging Phone — Stream View</h1>
          <p className="max-w-sm text-sm text-white/60">
            Grant camera access, hang the phone over the field, and go live. The pixel-watcher will
            read the scoreboard from your calibration pins.
          </p>
          {error && <p className="max-w-sm text-sm text-red-400">{error}</p>}
          <button
            onClick={startCamera}
            className="tap-target rounded-xl bg-accent px-6 py-3 text-lg font-bold text-broadcast active:scale-95"
          >
            Start Camera
          </button>
          <Link href="/" className="text-sm text-white/40 underline">
            ← Back
          </Link>
        </div>
      )}

      {/* Control panel */}
      {cameraOn && showControls && (
        <div className="absolute inset-x-0 top-0 z-20 flex justify-center p-3">
          <div className="pointer-events-auto w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-broadcast/90 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <Link href="/" className="text-sm text-white/50 underline">
                ← Home
              </Link>
              <div className="flex items-center gap-2 text-xs text-white/60">
                <span className={`h-2 w-2 rounded-full ${live ? 'bg-red-500 animate-pulse' : 'bg-white/30'}`} />
                {live ? 'LIVE' : 'Idle'}
              </div>
            </div>

            {SYNC_MODE() === 'local' && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90 ring-1 ring-amber-500/20">
                ⚠ Local-only: this phone won&apos;t receive the controller&apos;s overrides. Configure
                Supabase in Vercel to sync across devices.
              </p>
            )}

            <label className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
              <span>Pixel-watcher CV ({WATCH_FPS} FPS)</span>
              <input
                type="checkbox"
                checked={watching}
                onChange={(e) => setWatching(e.target.checked)}
                className="h-5 w-5 accent-accent"
              />
            </label>
            <p className="text-xs text-white/40">
              {pins.length} calibration pin{pins.length === 1 ? '' : 's'} active.{' '}
              {pins.length === 0 && 'Add pins in the Controller → Calibrate view.'}
            </p>

            <div className="space-y-2 rounded-lg bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                WHIP ingest (Livepeer / Mux / Cloudflare)
              </p>
              <input
                value={whipUrl}
                onChange={(e) => setWhipUrl(e.target.value)}
                placeholder="https://…/whip endpoint URL (optional)"
                className="w-full rounded-md bg-black/40 px-2 py-1.5 text-sm outline-none ring-1 ring-white/10 focus:ring-accent"
              />
              <input
                value={whipToken}
                onChange={(e) => setWhipToken(e.target.value)}
                placeholder="Bearer token (optional)"
                className="w-full rounded-md bg-black/40 px-2 py-1.5 text-sm outline-none ring-1 ring-white/10 focus:ring-accent"
              />
            </div>

            {!live ? (
              <button
                onClick={goLive}
                className="tap-target w-full rounded-xl bg-red-600 py-3 text-lg font-bold active:scale-95"
              >
                ● Go Live
              </button>
            ) : (
              <button
                onClick={stopLive}
                className="tap-target w-full rounded-xl bg-white/15 py-3 text-lg font-bold active:scale-95"
              >
                ■ Stop
              </button>
            )}

            {statusMsg && <p className="text-center text-xs text-white/70">{statusMsg}</p>}
            {recordUrl && (
              <a
                href={recordUrl}
                download={`diamond-overlay-${Date.now()}.webm`}
                className="block rounded-lg bg-emerald-600/80 py-2 text-center text-sm font-semibold"
              >
                ⬇ Download recording
              </a>
            )}
            <p className="text-center text-[11px] text-white/40">Tap the video to hide controls</p>
          </div>
        </div>
      )}
    </main>
  );
}
