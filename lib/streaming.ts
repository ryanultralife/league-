// Lightweight browser streaming client.
//
// Two output paths from a composited MediaStream (camera + burned-in overlay):
//
//   1. WHIP (WebRTC-HTTP Ingest Protocol) — the standard used by Livepeer, Mux,
//      and Cloudflare Stream for browser publishing. Provide the WHIP endpoint
//      URL and we negotiate a WebRTC sender. This is the "go live" path.
//   2. MediaRecorder — records the same composite to a downloadable WebM clip,
//      used as a local fallback / DVR when no ingest URL is configured.

export interface WhipSession {
  pc: RTCPeerConnection;
  resourceUrl: string | null;
  stop: () => Promise<void>;
}

/**
 * Publish a MediaStream to a WHIP ingest endpoint (Livepeer/Mux/Cloudflare).
 * `token` is sent as a Bearer header if the provider requires it.
 */
export async function startWhip(
  stream: MediaStream,
  endpoint: string,
  token?: string,
): Promise<WhipSession> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  for (const track of stream.getTracks()) {
    pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  // Wait briefly for ICE gathering so the offer includes candidates.
  await waitForIce(pc, 2000);

  const headers: Record<string, string> = { 'Content-Type': 'application/sdp' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: pc.localDescription?.sdp ?? offer.sdp ?? '',
  });
  if (!res.ok) {
    pc.close();
    throw new Error(`WHIP publish failed: ${res.status} ${res.statusText}`);
  }
  const answer = await res.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answer });

  const resourceUrl = res.headers.get('Location');

  const stop = async () => {
    try {
      if (resourceUrl) {
        await fetch(new URL(resourceUrl, endpoint).toString(), {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }).catch(() => {});
      }
    } finally {
      pc.getSenders().forEach((snd) => snd.track?.stop());
      pc.close();
    }
  };

  return { pc, resourceUrl, stop };
}

function waitForIce(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(done, timeoutMs);
  });
}

export interface Recorder {
  stop: () => void;
  mimeType: string;
}

/** Pick the best supported recording mime type. */
export function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || 'video/webm';
}

/**
 * Record a stream to a WebM/MP4 blob; `onComplete` receives the object URL when
 * stopped. Useful as a local DVR fallback.
 */
export function startRecording(
  stream: MediaStream,
  onComplete: (url: string, mime: string) => void,
): Recorder {
  const mimeType = pickMimeType();
  const chunks: BlobPart[] = [];
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    onComplete(URL.createObjectURL(blob), mimeType);
  };
  rec.start(1000); // 1s timeslices
  return {
    stop: () => rec.state !== 'inactive' && rec.stop(),
    mimeType,
  };
}
