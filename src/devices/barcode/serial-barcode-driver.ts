import { SerialPort } from 'serialport';
import { BaseDriver, BaseDriverConfig } from '../common/base-driver.js';
import { BarcodeEvent } from '../../models/barcode.types.js';
import { logger } from '../../utils/logger.js';
import { DeviceConnectionError } from '../../utils/errors.js';

export interface SerialBarcodeDriverConfig extends BaseDriverConfig {
  port?: string;
  baudRate?: number;
}

export class SerialBarcodeDriver extends BaseDriver {
  private serialPort: SerialPort | null = null;
  private currentBuffer = '';

  constructor(config: SerialBarcodeDriverConfig) {
    super({
      ...config,
      type: 'barcode_scanner',
      connectionType: 'serial',
    });
  }

  protected async doConnect(): Promise<void> {
    const portName = this.connectionParams?.port || (this.options?.port as string);
    const baudRate = this.connectionParams?.baudRate || (this.options?.baudRate as number) || 9600;

    if (!portName) {
      throw new DeviceConnectionError(this.id, 'Serial port path (e.g. COM3 or /dev/ttyUSB0) is required.');
    }

    return new Promise<void>((resolve, reject) => {
      try {
        logger.debug(`SerialBarcode:${this.id}`, `Opening serial port ${portName} at ${baudRate} baud`);
        this.serialPort = new SerialPort({
          path: portName,
          baudRate,
          autoOpen: false,
        });

        this.serialPort.open((err) => {
          if (err) {
            this.serialPort = null;
            reject(new DeviceConnectionError(this.id, err.message, err));
            return;
          }

          this.setupListeners();
          resolve();
        });
      } catch (err) {
        this.serialPort = null;
        reject(new DeviceConnectionError(this.id, err instanceof Error ? err.message : String(err), err));
      }
    });
  }

  private setupListeners(): void {
    if (!this.serialPort) return;

    this.serialPort.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      for (const char of text) {
        if (char === '\r' || char === '\n') {
          if (this.currentBuffer.trim().length > 0) {
            this.dispatchBarcode(this.currentBuffer.trim());
          }
          this.currentBuffer = '';
        } else {
          this.currentBuffer += char;
        }
      }
    });

    this.serialPort.on('error', (err: Error) => {
      logger.error(`SerialBarcode:${this.id}`, `Serial port error: ${err.message}`);
      this.emit('error', err);
      this.setStatus('error', err);
    });

    this.serialPort.on('close', () => {
      logger.warn(`SerialBarcode:${this.id}`, 'Serial port closed');
      this.setStatus('disconnected');
    });
  }

  private dispatchBarcode(code: string): void {
    const event: BarcodeEvent = {
      barcode: code,
      deviceId: this.id,
      timestamp: new Date().toISOString(),
      raw: code,
    };

    logger.info(`SerialBarcode:${this.id}`, `Serial barcode scanned: [${code}]`);
    this.emit('barcode', event);
    this.emit('data', event);
  }

  protected async doDisconnect(): Promise<void> {
    this.currentBuffer = '';
    if (this.serialPort && this.serialPort.isOpen) {
      return new Promise<void>((resolve) => {
        this.serialPort!.close((err) => {
          if (err) {
            logger.warn(`SerialBarcode:${this.id}`, `Error closing serial port: ${err.message}`);
          }
          this.serialPort = null;
          resolve();
        });
      });
    }
  }
}

