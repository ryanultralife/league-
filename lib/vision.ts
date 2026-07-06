// Pixel-watcher computer vision.
//
// The stream view renders the camera to a hidden canvas at a low frame rate and
// samples the calibration pins. A pin is "lit" when the sampled pixel is within
// a Euclidean color distance threshold of its reference RGB. Counts are derived
// from how many pins of each kind are lit.

import type { CalibrationPin } from './types';

export const COLOR_DELTA_THRESHOLD = 45;

export function colorDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Sample the RGB at a normalized coordinate from canvas image data. */
export function sampleRgb(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  xPct: number,
  yPct: number,
): [number, number, number] {
  const x = clampInt(Math.round(xPct * width), 0, width - 1);
  const y = clampInt(Math.round(yPct * height), 0, height - 1);
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export interface VisionReading {
  balls?: number;
  strikes?: number;
  outs?: number;
  bases?: { first?: boolean; second?: boolean; third?: boolean };
}

/**
 * Given the calibration pins and the current frame, decide the game state.
 * Count pins (ball/strike/out) contribute to a max lit slot; base pins toggle
 * base occupancy directly.
 */
export function readState(
  pins: CalibrationPin[],
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = COLOR_DELTA_THRESHOLD,
): VisionReading {
  let balls = 0;
  let strikes = 0;
  let outs = 0;
  const bases = { first: false, second: false, third: false };
  let hasBall = false;
  let hasStrike = false;
  let hasOut = false;

  for (const pin of pins) {
    if (pin.kind === 'ignore' || pin.kind === 'speed') continue;
    const rgb = sampleRgb(data, width, height, pin.xPct, pin.yPct);
    const lit = colorDistance(rgb, pin.rgb) < threshold;
    if (!lit) continue;
    switch (pin.kind) {
      case 'ball':
        hasBall = true;
        balls = Math.max(balls, pin.slot ?? 1);
        break;
      case 'strike':
        hasStrike = true;
        strikes = Math.max(strikes, pin.slot ?? 1);
        break;
      case 'out':
        hasOut = true;
        outs = Math.max(outs, pin.slot ?? 1);
        break;
      case 'onbase':
        if (pin.slot === 1) bases.first = true;
        else if (pin.slot === 2) bases.second = true;
        else if (pin.slot === 3) bases.third = true;
        break;
    }
  }

  const reading: VisionReading = { bases };
  // Only report a count when at least one pin of that kind exists, so we don't
  // clobber manual overrides on scoreboards we haven't calibrated for.
  if (pins.some((p) => p.kind === 'ball')) reading.balls = hasBall ? balls : 0;
  if (pins.some((p) => p.kind === 'strike')) reading.strikes = hasStrike ? strikes : 0;
  if (pins.some((p) => p.kind === 'out')) reading.outs = hasOut ? outs : 0;
  return reading;
}
