// Generates the PWA PNG icons from scratch (no image libraries required).
// Draws a baseball on the brand-dark background and encodes a valid PNG
// via zlib. Run with `node scripts/gen-icons.js`.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // filter byte 0 per scanline
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  // Ball radius: smaller for maskable so it survives the safe-zone crop.
  const ballR = size * (maskable ? 0.3 : 0.36);
  const bg = [6, 8, 15]; // #06080f
  const accent = [255, 210, 63]; // #ffd23f ring
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let r = bg[0];
      let g = bg[1];
      let b = bg[2];
      let a = 255;
      if (d < ballR) {
        // White ball body.
        r = 245;
        g = 245;
        b = 242;
        // Red stitches: two arcs offset from center.
        const arc = size * 0.26;
        const near =
          Math.abs(Math.sqrt((dx - size * 0.14) ** 2 + dy * dy) - arc) < size * 0.012 ||
          Math.abs(Math.sqrt((dx + size * 0.14) ** 2 + dy * dy) - arc) < size * 0.012;
        if (near) {
          r = 196;
          g = 30;
          b = 58;
        }
      } else if (d < ballR + size * 0.03) {
        // Accent ring around the ball.
        r = accent[0];
        g = accent[1];
        b = accent[2];
      }
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return encodePng(size, rgba);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), drawIcon(192, false));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), drawIcon(512, false));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), drawIcon(512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), drawIcon(180, false));
console.log('Icons written to', outDir);
