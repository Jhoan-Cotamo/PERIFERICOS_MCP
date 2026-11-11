import { SerialPort } from 'serialport';
import { BaseDriver, BaseDriverConfig } from '../common/base-driver.js';
import { logger } from '../../utils/logger.js';
import { DeviceConnectionError } from '../../utils/errors.js';

export interface GenericSerialDriverConfig extends BaseDriverConfig {
  port?: string;
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
}

export class GenericSerialDriver extends BaseDriver {
  private serialPort: SerialPort | null = null;
  private lineDelimiter = '\n';
  private buffer = '';

  constructor(config: GenericSerialDriverConfig) {
    super({
      ...config,
      type: config.type || 'serial_device',
      connectionType: 'serial',
    });
  }

  protected async doConnect(): Promise<void> {
    const portName = this.connectionParams?.port || (this.options?.port as string);
    const baudRate = this.connectionParams?.baudRate || (this.options?.baudRate as number) || 9600;

    if (!portName) {
      throw new DeviceConnectionError(this.id, 'Serial port name is required');
    }

    return new Promise<void>((resolve, reject) => {
      try {
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
      this.buffer += chunk.toString('utf8');
      const lines = this.buffer.split(this.lineDelimiter);

      if (lines.length > 1) {
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            logger.debug(`GenericSerial:${this.id}`, `Received line: ${trimmed}`);
            this.emit('data', { deviceId: this.id, data: trimmed, timestamp: new Date().toISOString() });
          }
        }
      }
    });

    this.serialPort.on('error', (err) => {
      logger.error(`GenericSerial:${this.id}`, `Serial port error: ${err.message}`);
      this.setStatus('error', err);
    });

    this.serialPort.on('close', () => {
      logger.warn(`GenericSerial:${this.id}`, 'Serial port closed');
      this.setStatus('disconnected');
    });
  }

  public async send(data: string | Buffer): Promise<void> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error(`Serial port '${this.id}' is not open.`);
    }

    return new Promise<void>((resolve, reject) => {
      this.serialPort!.write(data, (err) => {
        if (err) reject(err);
        else {
          this.serialPort!.drain(() => resolve());
        }
      });
    });
  }

  protected async doDisconnect(): Promise<void> {
    if (this.serialPort && this.serialPort.isOpen) {
      return new Promise<void>((resolve) => {
        this.serialPort!.close(() => {
          this.serialPort = null;
          resolve();
        });
      });
    }
  }
}

