// Canvas renderer for the broadcast overlay.
//
// The React <BroadcastOverlay> is what the operator sees on-screen, but the
// outgoing stream is composited on a canvas (camera frame + graphics) so the
// graphics are burned into the video. This draws a compact, high-contrast
// version of the same scoreboard onto a 2D context.

import type { GameState } from './types';
import { currentBatter, currentPitcher, battingSide, fieldingSide } from './store';

const ACCENT = '#ffd23f';
const PANEL = 'rgba(10,14,26,0.85)';
const CHALK = '#f7f7f2';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, on: boolean, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = on ? color : 'rgba(255,255,255,0.14)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.stroke();
}

/**
 * Draw the overlay onto ctx sized WxH. Scales with the output resolution via a
 * unit `s` derived from width so it looks consistent at 720p/1080p.
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  state: GameState,
) {
  const s = W / 1280; // design scale reference: 1280px wide
  const g = state.session;
  const bat = battingSide(state);

  // ---- Top scoreboard bar ----
  const barH = 44 * s;
  const barW = 560 * s;
  const barX = (W - barW) / 2;
  const barY = 12 * s;
  ctx.fillStyle = PANEL;
  roundRect(ctx, barX, barY, barW, barH, 8 * s);
  ctx.fill();

  ctx.textBaseline = 'middle';
  const midY = barY + barH / 2;

  // Away
  ctx.font = `700 ${18 * s}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.fillStyle = bat === 'guest' ? ACCENT : CHALK;
  ctx.fillText(g.guest_name, barX + 14 * s, midY);
  ctx.font = `900 ${24 * s}px ui-monospace, monospace`;
  ctx.fillStyle = CHALK;
  ctx.fillText(String(g.guest_score), barX + 120 * s, midY);

  // Home
  ctx.font = `700 ${18 * s}px ui-monospace, monospace`;
  ctx.fillStyle = bat === 'home' ? ACCENT : CHALK;
  ctx.fillText(g.home_name, barX + 165 * s, midY);
  ctx.font = `900 ${24 * s}px ui-monospace, monospace`;
  ctx.fillStyle = CHALK;
  ctx.fillText(String(g.home_score), barX + 272 * s, midY);

  // Inning arrow + number
  ctx.textAlign = 'center';
  ctx.fillStyle = CHALK;
  ctx.font = `700 ${16 * s}px ui-monospace, monospace`;
  ctx.fillText(`${g.inning_half === 'top' ? '▲' : '▼'}${g.inning}`, barX + 330 * s, midY);

  // B/S/O dots
  const dotX = barX + 372 * s;
  const rowY = barY + 12 * s;
  const gap = 13 * s;
  const labels: Array<[string, number, number, string]> = [
    ['B', g.balls, 3, '#34d399'],
    ['S', g.strikes, 2, '#facc15'],
    ['O', g.outs, 2, '#ef4444'],
  ];
  ctx.textAlign = 'left';
  labels.forEach(([label, filled, total, color], row) => {
    const y = rowY + row * (10 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `700 ${9 * s}px ui-monospace, monospace`;
    ctx.fillText(label, dotX, y);
    for (let i = 0; i < total; i++) {
      dot(ctx, dotX + 14 * s + i * gap, y, 3.5 * s, i < filled, color);
    }
  });

  // R/H/E
  const rhe: Array<[string, number, number]> = [
    ['R', g.guest_score, g.home_score],
    ['H', state.box.guest.hits, state.box.home.hits],
    ['E', state.box.guest.errors, state.box.home.errors],
  ];
  ctx.textAlign = 'center';
  rhe.forEach(([label, away, home], i) => {
    const x = barX + 460 * s + i * 34 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `700 ${9 * s}px ui-monospace, monospace`;
    ctx.fillText(label, x, barY + 9 * s);
    ctx.fillStyle = CHALK;
    ctx.font = `700 ${12 * s}px ui-monospace, monospace`;
    ctx.fillText(String(away), x, barY + 24 * s);
    ctx.fillText(String(home), x, barY + 36 * s);
  });

  // ---- Bottom-left batter / pitcher ----
  const batter = currentBatter(state, bat);
  const pitcher = currentPitcher(state, fieldingSide(state));
  const cardW = 300 * s;
  const cardH = 78 * s;
  const cardX = 16 * s;
  const cardY = H - cardH - 16 * s;
  ctx.fillStyle = PANEL;
  roundRect(ctx, cardX, cardY, cardW, cardH, 8 * s);
  ctx.fill();
  ctx.fillStyle = ACCENT;
  roundRect(ctx, cardX, cardY, cardW, 16 * s, 8 * s);
  ctx.fill();
  ctx.fillStyle = '#0a0e1a';
  ctx.font = `900 ${10 * s}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('AT BAT', cardX + 10 * s, cardY + 8 * s);
  if (batter) {
    ctx.fillStyle = ACCENT;
    ctx.font = `900 ${26 * s}px ui-monospace, monospace`;
    ctx.fillText(batter.jersey_number, cardX + 12 * s, cardY + 40 * s);
    ctx.fillStyle = CHALK;
    ctx.font = `700 ${18 * s}px ui-monospace, monospace`;
    ctx.fillText(batter.name.slice(0, 18), cardX + 58 * s, cardY + 36 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `${11 * s}px ui-monospace, monospace`;
    ctx.fillText(
      `${batter.hits}-${batter.ab} · ${batter.rbi} RBI · ${batter.defensive_position}`,
      cardX + 58 * s,
      cardY + 52 * s,
    );
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `${11 * s}px ui-monospace, monospace`;
  ctx.fillText(
    pitcher ? `P  #${pitcher.jersey_number} ${pitcher.name.slice(0, 16)}` : 'P  —',
    cardX + 12 * s,
    cardY + 68 * s,
  );

  // ---- Bottom-right diamond ----
  drawDiamond(ctx, W - 84 * s, H - 84 * s, 60 * s, state);

  // ---- Bottom-center speed ----
  if (g.current_speed) {
    const sw = 150 * s;
    const sh = 60 * s;
    const sx = (W - sw) / 2;
    const sy = H - sh - 16 * s;
    ctx.fillStyle = PANEL;
    roundRect(ctx, sx, sy, sw, sh, 12 * s);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = ACCENT;
    ctx.font = `700 ${10 * s}px ui-monospace, monospace`;
    ctx.fillText('RADAR', sx + sw / 2, sy + 12 * s);
    ctx.fillStyle = CHALK;
    ctx.font = `900 ${34 * s}px ui-monospace, monospace`;
    ctx.fillText(`${g.current_speed}`, sx + sw / 2 - 12 * s, sy + 38 * s);
    ctx.font = `700 ${12 * s}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('MPH', sx + sw / 2 + 40 * s, sy + 42 * s);
  }
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  state: GameState,
) {
  const b = state.session.bases;
  const h = size / 2;
  // panel
  ctx.fillStyle = PANEL;
  roundRect(ctx, cx - h - 8, cy - h - 8, size + 16, size + 16, 8);
  ctx.fill();

  const base = (dx: number, dy: number, on: boolean) => {
    ctx.save();
    ctx.translate(cx + dx, cy + dy);
    ctx.rotate(Math.PI / 4);
    const bs = size * 0.22;
    ctx.fillStyle = on ? ACCENT : 'rgba(255,255,255,0.12)';
    ctx.strokeStyle = on ? ACCENT : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.fillRect(-bs / 2, -bs / 2, bs, bs);
    ctx.strokeRect(-bs / 2, -bs / 2, bs, bs);
    ctx.restore();
  };
  base(0, -h * 0.8, b.second); // 2nd (top)
  base(-h * 0.8, 0, b.third); // 3rd (left)
  base(h * 0.8, 0, b.first); // 1st (right)
}
