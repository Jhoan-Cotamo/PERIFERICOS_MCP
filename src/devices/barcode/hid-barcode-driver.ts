import HID from 'node-hid';
import { BaseDriver, BaseDriverConfig } from '../common/base-driver.js';
import { BarcodeEvent } from '../../models/barcode.types.js';
import { decodeHidKeyboardReport, decodeRawAsciiReport } from '../../utils/hid-utils.js';
import { logger } from '../../utils/logger.js';
import { DeviceConnectionError } from '../../utils/errors.js';

export interface HidBarcodeDriverConfig extends BaseDriverConfig {
  vendorId?: number;
  productId?: number;
  devicePath?: string;
}

export class HidBarcodeDriver extends BaseDriver {
  private hidDevice: HID.HID | null = null;
  private currentBuffer = '';
  private bufferTimeout: NodeJS.Timeout | null = null;
  private readonly bufferTimeoutMs = 150; // Timeout between keystrokes to detect end of barcode if no Enter is sent

  constructor(config: HidBarcodeDriverConfig) {
    super({
      ...config,
      type: 'barcode_scanner',
      connectionType: 'usb_hid',
    });
  }

  protected async doConnect(): Promise<void> {
    try {
      const path = this.connectionParams?.path || (this.options?.devicePath as string);
      const vid = this.connectionParams?.vendorId || (this.options?.vendorId as number);
      const pid = this.connectionParams?.productId || (this.options?.productId as number);

      if (path) {
        logger.debug(`HidBarcode:${this.id}`, `Opening HID device by path: ${path}`);
        this.hidDevice = new HID.HID(path);
      } else if (vid && pid) {
        logger.debug(`HidBarcode:${this.id}`, `Opening HID device by VID:PID 0x${vid.toString(16)}:0x${pid.toString(16)}`);
        this.hidDevice = new HID.HID(vid, pid);
      } else {
        // Auto-detect first available HID barcode reader
        const devices = HID.devices();
        const candidate = devices.find((d) => d.path && (d.vendorId || d.product));
        if (candidate && candidate.path) {
          logger.info(`HidBarcode:${this.id}`, `Auto-selecting HID device: ${candidate.product || candidate.path}`);
          this.hidDevice = new HID.HID(candidate.path);
        } else {
          throw new Error('No valid HID barcode scanner path or VID/PID provided.');
        }
      }

      this.setupListeners();
    } catch (err) {
      this.hidDevice = null;
      throw new DeviceConnectionError(this.id, err instanceof Error ? err.message : String(err), err);
    }
  }

  private setupListeners(): void {
    if (!this.hidDevice) return;

    this.hidDevice.on('data', (data: Buffer) => {
      this.handleInputReport(data);
    });

    this.hidDevice.on('error', (err: Error) => {
      logger.error(`HidBarcode:${this.id}`, `HID device error: ${err.message}`);
      this.emit('error', err);
      this.setStatus('error', err);
    });
  }

  private handleInputReport(data: Buffer): void {
    // Try standard keyboard report first, then fallback to raw ASCII
    const keyReport = decodeHidKeyboardReport(data);
    let chars = keyReport.text;
    let isTerminator = keyReport.isEnter;

    if (!chars && !isTerminator) {
      const asciiReport = decodeRawAsciiReport(data);
      chars = asciiReport.text;
      isTerminator = asciiReport.isEnter;
    }

    if (chars) {
      this.currentBuffer += chars;
    }

    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
      this.bufferTimeout = null;
    }

    if (isTerminator) {
      this.dispatchBarcode();
    } else if (this.currentBuffer.length > 0) {
      // In case the scanner is not configured to send Enter at the end of scan
      this.bufferTimeout = setTimeout(() => {
        if (this.currentBuffer.trim().length >= 3) {
          this.dispatchBarcode();
        } else {
          this.currentBuffer = '';
        }
      }, this.bufferTimeoutMs);
    }
  }

  private dispatchBarcode(): void {
    const rawCode = this.currentBuffer.trim();
    this.currentBuffer = '';

    if (!rawCode) return;

    const event: BarcodeEvent = {
      barcode: rawCode,
      deviceId: this.id,
      timestamp: new Date().toISOString(),
      raw: rawCode,
    };

    logger.info(`HidBarcode:${this.id}`, `Barcode scanned: [${rawCode}]`);
    this.emit('barcode', event);
    this.emit('data', event);
  }

  protected async doDisconnect(): Promise<void> {
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
      this.bufferTimeout = null;
    }
    this.currentBuffer = '';

    if (this.hidDevice) {
      try {
        this.hidDevice.close();
      } catch (err) {
        logger.warn(`HidBarcode:${this.id}`, `Error closing HID device: ${String(err)}`);
      } finally {
        this.hidDevice = null;
      }
    }
  }
}
