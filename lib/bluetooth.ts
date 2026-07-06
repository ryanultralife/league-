// Web Bluetooth radar intake.
//
// Pocket-radar style guns advertise as "Pocket Radar", "PR", or similar and
// expose their reading over a GATT notify characteristic. Since vendors differ,
// we connect, walk every notifiable characteristic, subscribe to all of them,
// and parse whatever bytes arrive into an mph value. The parser is defensive:
// it tries ASCII digits first (many guns send "at " strings), then common
// binary encodings.

export interface RadarConnection {
  device: BluetoothDevice;
  disconnect: () => void;
}

const NAME_PREFIXES = ['Pocket', 'Radar', 'PR'];

export function bluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
}

/** Parse a DataView from a radar notification into an mph reading, or null. */
export function parseSpeed(view: DataView): number | null {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

  // 1) ASCII payloads, e.g. "88", "at 88", "88 MPH".
  let ascii = '';
  for (const b of bytes) ascii += String.fromCharCode(b);
  const asciiMatch = ascii.match(/(\d{1,3})/);
  if (asciiMatch) {
    const n = parseInt(asciiMatch[1], 10);
    if (n >= 10 && n <= 130) return n;
  }

  // 2) Single-byte speed.
  if (bytes.length === 1 && bytes[0] >= 10 && bytes[0] <= 130) return bytes[0];

  // 3) 16-bit little-endian somewhere in the first few bytes.
  for (let i = 0; i + 1 < bytes.length; i++) {
    const le = bytes[i] | (bytes[i + 1] << 8);
    if (le >= 10 && le <= 130) return le;
  }

  // 4) Any plausible single byte.
  for (const b of bytes) if (b >= 10 && b <= 130) return b;

  return null;
}

/**
 * Prompt the user to pick a radar device, connect, and stream speed readings.
 * `onSpeed` is called for every parsed reading. Must be triggered from a user
 * gesture (button click) per Web Bluetooth rules.
 */
export async function connectRadar(
  onSpeed: (mph: number) => void,
  onStatus?: (s: string) => void,
): Promise<RadarConnection> {
  if (!bluetoothSupported()) {
    throw new Error('Web Bluetooth is not available in this browser.');
  }
  onStatus?.('Requesting device…');
  const device = await (navigator as any).bluetooth.requestDevice({
    filters: NAME_PREFIXES.map((p) => ({ namePrefix: p })),
    // Accept all services so we can discover the vendor-specific notify char.
    optionalServices: [
      0xffe0, 0xfff0, 0x180a, 0x180f,
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000fff0-0000-1000-8000-00805f9b34fb',
    ],
  });

  onStatus?.(`Connecting to ${device.name || 'radar'}…`);
  const server = await device.gatt!.connect();
  const services = await server.getPrimaryServices();

  let subscribed = 0;
  for (const service of services) {
    let chars: BluetoothRemoteGATTCharacteristic[] = [];
    try {
      chars = await service.getCharacteristics();
    } catch {
      continue;
    }
    for (const ch of chars) {
      if (!ch.properties.notify && !ch.properties.indicate) continue;
      try {
        await ch.startNotifications();
        ch.addEventListener('characteristicvaluechanged', (ev: Event) => {
          const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
          if (!value) return;
          const mph = parseSpeed(value);
          if (mph !== null) onSpeed(mph);
        });
        subscribed++;
      } catch {
        /* characteristic refused notifications; skip */
      }
    }
  }

  if (subscribed === 0) {
    onStatus?.('Connected, but no notify characteristic was found.');
  } else {
    onStatus?.(`Connected — listening on ${subscribed} channel(s).`);
  }

  const disconnect = () => {
    try {
      device.gatt?.disconnect();
    } catch {
      /* noop */
    }
  };
  device.addEventListener('gattserverdisconnected', () => onStatus?.('Radar disconnected.'));

  return { device, disconnect };
}
