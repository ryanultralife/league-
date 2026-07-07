'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

// Default to the configured Livepeer playback ID. Override per-visit with
// ?v=<playbackId>, or set NEXT_PUBLIC_LIVEPEER_PLAYBACK_ID in the deployment.
const DEFAULT_PLAYBACK_ID =
  process.env.NEXT_PUBLIC_LIVEPEER_PLAYBACK_ID || '4470k1mfh7li09pa';

function hlsUrl(id: string) {
  return `https://livepeercdn.studio/hls/${id}/index.m3u8`;
}

type Status = 'loading' | 'playing' | 'waiting' | 'error';

/**
 * Branded public watch page. Plays the live Livepeer HLS stream (the broadcast
 * already has the scoreboard overlay burned in). Uses native HLS on Safari/iOS
 * and hls.js everywhere else. Read-only and shareable.
 */
export default function WatchPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackId, setPlaybackId] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPlaybackId((params.get('v') || DEFAULT_PLAYBACK_ID).trim());
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackId) return;
    const src = hlsUrl(playbackId);
    let hls: any = null;
    let retry: number | null = null;
    let cancelled = false;

    const onPlaying = () => setStatus('playing');
    video.addEventListener('playing', onPlaying);

    // Native HLS (Safari / iOS).
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('error', () => setStatus('waiting'));
    } else {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (cancelled) return;
          if (Hls.isSupported()) {
            hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3 });
            hls.loadSource(src);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_e: unknown, data: any) => {
              // A missing manifest usually means the broadcast hasn't started;
              // keep retrying so the page auto-recovers when it goes live.
              if (data?.fatal) {
                setStatus('waiting');
                if (retry === null) {
                  retry = window.setInterval(() => {
                    try {
                      hls.loadSource(src);
                      hls.startLoad();
                    } catch {
                      /* noop */
                    }
                  }, 5000);
                }
              }
            });
          } else {
            video.src = src; // last-resort
          }
        })
        .catch(() => setStatus('error'));
    }

    video.play().catch(() => {
      /* autoplay may be blocked until user interacts; controls are shown */
    });

    return () => {
      cancelled = true;
      video.removeEventListener('playing', onPlaying);
      if (retry !== null) window.clearInterval(retry);
      if (hls) hls.destroy();
    };
  }, [playbackId]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted) v.play().catch(() => {});
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = videoRef.current?.parentElement;
    if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-black text-chalk">
      <header className="flex items-center justify-between bg-broadcast px-4 py-2">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold">
          <span className="text-xl">⚾</span>
          <span>Diamond Overlay</span>
        </Link>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5">
            <span
              className={`h-2 w-2 rounded-full ${
                status === 'playing' ? 'bg-red-500 animate-pulse' : 'bg-white/40'
              }`}
            />
            {status === 'playing' ? 'LIVE' : status === 'waiting' ? 'Offline' : '…'}
          </span>
          <Link href="/view" className="rounded-full bg-white/10 px-2 py-0.5 hover:bg-white/20">
            Scoreboard →
          </Link>
        </div>
      </header>

      <div className="relative flex flex-1 items-center justify-center bg-black">
        <video
          ref={videoRef}
          className="h-full max-h-[calc(100vh-3rem)] w-full object-contain"
          playsInline
          muted={muted}
          autoPlay
          controls
        />

        {status !== 'playing' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-center">
            <span className="text-4xl">📺</span>
            <p className="text-lg font-bold">
              {status === 'waiting'
                ? 'Waiting for the broadcast to start…'
                : status === 'error'
                  ? 'Playback unavailable'
                  : 'Connecting…'}
            </p>
            {status === 'waiting' && (
              <p className="max-w-sm text-sm text-white/50">
                This page will start playing automatically once the stream goes live.
              </p>
            )}
          </div>
        )}

        {muted && status === 'playing' && (
          <button
            onClick={toggleMute}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-sm font-bold text-broadcast"
          >
            🔊 Tap to unmute
          </button>
        )}

        <button
          onClick={toggleFullscreen}
          className="absolute right-3 top-3 rounded-lg bg-black/50 px-3 py-1.5 text-xs font-semibold"
        >
          ⤢ Fullscreen
        </button>
      </div>
    </main>
  );
}
