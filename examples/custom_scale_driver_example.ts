/**
 * Guía / Ejemplo: Cómo crear e incorporar un nuevo driver de hardware en hardware-mcp
 *
 * Caso de uso: Balanza electrónica comercial (Dibal, Toledo, CAS, Torrey) conectada por RS-232 / USB Serial
 */

import { SerialPort } from 'serialport';
import { BaseDriver, BaseDriverConfig } from '../src/devices/common/base-driver.js';
import { driverRegistry } from '../src/devices/common/driver-registry.js';
import { logger } from '../src/utils/logger.js';
import { DeviceConnectionError } from '../src/utils/errors.js';

export interface ScaleReading {
  weightKg: number;
  isStable: boolean;
  unit: string;
  raw: string;
  timestamp: string;
}

export class ElectronicScaleDriver extends BaseDriver {
  private serialPort: SerialPort | null = null;
  private buffer = '';
  private lastReading: ScaleReading | null = null;

  constructor(config: BaseDriverConfig) {
    super({
      ...config,
      type: 'scale',
      connectionType: 'serial',
    });
  }

  protected async doConnect(): Promise<void> {
    const port = this.connectionParams?.port || 'COM3';
    const baudRate = this.connectionParams?.baudRate || 9600;

    return new Promise((resolve, reject) => {
      this.serialPort = new SerialPort({ path: port, baudRate, autoOpen: false });

      this.serialPort.open((err) => {
        if (err) {
          reject(new DeviceConnectionError(this.id, err.message, err));
          return;
        }

        this.setupSerialListeners();
        resolve();
      });
    });
  }

  private setupSerialListeners(): void {
    if (!this.serialPort) return;

    this.serialPort.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('ascii');
      const lines = this.buffer.split('\n');

      if (lines.length > 1) {
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          this.parseScaleLine(line.trim());
        }
      }
    });

    this.serialPort.on('error', (err) => {
      this.setStatus('error', err);
    });
  }

  /**
   * Parser estándar para balanzas comerciales (ej: "ST,GS,+001.250kg")
   */
  private parseScaleLine(line: string): void {
    if (!line) return;

    // Regex para capturar estado (ST = Estable, US = Inestable) y peso
    const match = line.match(/(ST|US)[^0-9+-]*([+-]?\d+\.?\d*)\s*(kg|g|lb)?/i);
    if (match) {
      const isStable = match[1].toUpperCase() === 'ST';
      const weightKg = parseFloat(match[2]);
      const unit = (match[3] || 'kg').toLowerCase();

      this.lastReading = {
        weightKg,
        isStable,
        unit,
        raw: line,
        timestamp: new Date().toISOString(),
      };

      this.emit('weight', this.lastReading);
      this.emit('data', this.lastReading);
    }
  }

  public getReading(): ScaleReading | null {
    return this.lastReading;
  }

  /**
   * Solicita lectura manual enviando el comando ENQ (0x05) o "W\r\n" a la balanza
   */
  public async requestWeight(): Promise<void> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Balanza desconectada');
    }
    this.serialPort.write(Buffer.from([0x05])); // ENQ
  }

  protected async doDisconnect(): Promise<void> {
    if (this.serialPort && this.serialPort.isOpen) {
      await new Promise<void>((resolve) => this.serialPort!.close(() => resolve()));
      this.serialPort = null;
    }
  }
}

// -------------------------------------------------------------------------
// PASO 2: Registro en el sistema de plugins / drivers de hardware-mcp
// -------------------------------------------------------------------------

export function registerElectronicScalePlugin(): void {
  driverRegistry.register(
    'electronic-scale',
    'scale',
    'Balanza electrónica comercial RS-232 / USB Serial (Dibal, Toledo, CAS)',
    (config) => new ElectronicScaleDriver(config)
  );

  logger.info('ScalePlugin', 'Driver de balanza electrónica registrado exitosamente.');
}

