/**
 * USB HID Utility functions:
 * - Scancode to ASCII conversion for standard USB HID Keyboards / Barcode Scanners (HID Page 0x07)
 * - Raw report decoding
 * - Known Barcode Scanner Vendor ID heuristics
 */

export interface HidKeyMap {
  normal: string;
  shift: string;
}

// USB HID Usage Table - Page 0x07 (Keyboard/Keypad)
const HID_KEY_CODES: Record<number, HidKeyMap> = {
  0x04: { normal: 'a', shift: 'A' },
  0x05: { normal: 'b', shift: 'B' },
  0x06: { normal: 'c', shift: 'C' },
  0x07: { normal: 'd', shift: 'D' },
  0x08: { normal: 'e', shift: 'E' },
  0x09: { normal: 'f', shift: 'F' },
  0x0a: { normal: 'g', shift: 'G' },
  0x0b: { normal: 'h', shift: 'H' },
  0x0c: { normal: 'i', shift: 'I' },
  0x0d: { normal: 'j', shift: 'J' },
  0x0e: { normal: 'k', shift: 'K' },
  0x0f: { normal: 'l', shift: 'L' },
  0x10: { normal: 'm', shift: 'M' },
  0x11: { normal: 'n', shift: 'N' },
  0x12: { normal: 'o', shift: 'O' },
  0x13: { normal: 'p', shift: 'P' },
  0x14: { normal: 'q', shift: 'Q' },
  0x15: { normal: 'r', shift: 'R' },
  0x16: { normal: 's', shift: 'S' },
  0x17: { normal: 't', shift: 'T' },
  0x18: { normal: 'u', shift: 'U' },
  0x19: { normal: 'v', shift: 'V' },
  0x1a: { normal: 'w', shift: 'W' },
  0x1b: { normal: 'x', shift: 'X' },
  0x1c: { normal: 'y', shift: 'Y' },
  0x1d: { normal: 'z', shift: 'Z' },
  0x1e: { normal: '1', shift: '!' },
  0x1f: { normal: '2', shift: '@' },
  0x20: { normal: '3', shift: '#' },
  0x21: { normal: '4', shift: '$' },
  0x22: { normal: '5', shift: '%' },
  0x23: { normal: '6', shift: '^' },
  0x24: { normal: '7', shift: '&' },
  0x25: { normal: '8', shift: '*' },
  0x26: { normal: '9', shift: '(' },
  0x27: { normal: '0', shift: ')' },
  0x28: { normal: '\n', shift: '\n' }, // Enter / Return
  0x29: { normal: '', shift: '' },    // Escape
  0x2a: { normal: '', shift: '' },    // Backspace
  0x2b: { normal: '\t', shift: '\t' }, // Tab
  0x2c: { normal: ' ', shift: ' ' },  // Space
  0x2d: { normal: '-', shift: '_' },
  0x2e: { normal: '=', shift: '+' },
  0x2f: { normal: '[', shift: '{' },
  0x30: { normal: ']', shift: '}' },
  0x31: { normal: '\\', shift: '|' },
  0x33: { normal: ';', shift: ':' },
  0x34: { normal: "'", shift: '"' },
  0x35: { normal: '`', shift: '~' },
  0x36: { normal: ',', shift: '<' },
  0x37: { normal: '.', shift: '>' },
  0x38: { normal: '/', shift: '?' },
  // Keypad
  0x54: { normal: '/', shift: '/' },
  0x55: { normal: '*', shift: '*' },
  0x56: { normal: '-', shift: '-' },
  0x57: { normal: '+', shift: '+' },
  0x58: { normal: '\n', shift: '\n' }, // Keypad Enter
  0x59: { normal: '1', shift: '1' },
  0x5a: { normal: '2', shift: '2' },
  0x5b: { normal: '3', shift: '3' },
  0x5c: { normal: '4', shift: '4' },
  0x5d: { normal: '5', shift: '5' },
  0x5e: { normal: '6', shift: '6' },
  0x5f: { normal: '7', shift: '7' },
  0x60: { normal: '8', shift: '8' },
  0x61: { normal: '9', shift: '9' },
  0x62: { normal: '0', shift: '0' },
  0x63: { normal: '.', shift: '.' },
};

export const KNOWN_BARCODE_VENDORS: Record<number, string> = {
  0x05e0: 'Symbol / Zebra Technologies',
  0x0c2e: 'Honeywell / Metrologic',
  0x05f9: 'Datalogic',
  0x1eab: 'Newland Auto-ID',
  0x2017: 'Netum',
  0x0483: 'Tera / STMicroelectronics Barcode',
  0x10c4: 'Silicon Labs (Virtual COM Scanner)',
  0x04b8: 'Epson',
  0x0416: 'Winbond / XPrinter POS',
  0x1fc9: 'NXP POS Scanner',
  0x28e9: 'Zydacron / Generic Scanner',
};

/**
 * Checks whether a USB vendor ID or product description matches known barcode scanners
 */
export function isLikelyBarcodeScanner(device: {
  vendorId?: number;
  productId?: number;
  product?: string;
  manufacturer?: string;
  usage?: number;
  usagePage?: number;
}): boolean {
  if (device.vendorId && KNOWN_BARCODE_VENDORS[device.vendorId]) {
    return true;
  }

  const text = `${device.product || ''} ${device.manufacturer || ''}`.toLowerCase();
  const keywords = ['barcode', 'scanner', 'symbol', 'honeywell', 'datalogic', 'netum', 'pos scanner', 'tera'];

  return keywords.some((k) => text.includes(k));
}

/**
 * Parses an 8-byte standard USB HID keyboard report into characters.
 * Returns decoded string and whether Enter was pressed.
 */
export function decodeHidKeyboardReport(report: Buffer): { text: string; isEnter: boolean } {
  if (report.length < 3) {
    return { text: '', isEnter: false };
  }

  const modifier = report[0];
  const isShift = (modifier & 0x02) !== 0 || (modifier & 0x20) !== 0; // Left or Right shift

  let text = '';
  let isEnter = false;

  // Keycodes are usually from byte index 2 onwards (up to byte 7)
  for (let i = 2; i < report.length; i++) {
    const code = report[i];
    if (code === 0) continue;

    if (code === 0x28 || code === 0x58) {
      isEnter = true;
      continue;
    }

    const key = HID_KEY_CODES[code];
    if (key) {
      text += isShift ? key.shift : key.normal;
    }
  }

  return { text, isEnter };
}

/**
 * Decodes raw report buffer which may be ASCII directly (used by some POS readers)
 */
export function decodeRawAsciiReport(report: Buffer): { text: string; isEnter: boolean } {
  let text = '';
  let isEnter = false;

  for (let i = 0; i < report.length; i++) {
    const byte = report[i];
    if (byte === 0x0d || byte === 0x0a) {
      isEnter = true;
    } else if (byte >= 32 && byte <= 126) {
      text += String.fromCharCode(byte);
    }
  }

  return { text, isEnter };
}

