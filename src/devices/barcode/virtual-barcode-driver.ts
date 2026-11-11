import { BaseDriver, BaseDriverConfig } from '../common/base-driver.js';
import { BarcodeEvent } from '../../models/barcode.types.js';
import { logger } from '../../utils/logger.js';

export interface VirtualBarcodeDriverConfig extends BaseDriverConfig {
  autoScanIntervalMs?: number;
  sampleBarcodes?: string[];
}

export class VirtualBarcodeDriver extends BaseDriver {
  private autoScanTimer: NodeJS.Timeout | null = null;
  private sampleBarcodes: string[] = [
    '7701234567890',
    '7501031311309',
    '8410100010014',
    '012345678905',
    'PROD-9988-ABC',
  ];
  private sampleIndex = 0;

  constructor(config: VirtualBarcodeDriverConfig) {
    super({
      ...config,
      type: 'barcode_scanner',
      connectionType: 'virtual',
    });

    if (config.sampleBarcodes && config.sampleBarcodes.length > 0) {
      this.sampleBarcodes = config.sampleBarcodes;
    }
  }

  protected async doConnect(): Promise<void> {
    logger.info(`VirtualBarcode:${this.id}`, 'Virtual Barcode Scanner connected (Ready for simulated scans)');

    const interval = (this.options?.autoScanIntervalMs as number) || 0;
    if (interval > 0) {
      this.startAutoScan(interval);
    }
  }

  private startAutoScan(intervalMs: number): void {
    this.stopAutoScan();
    this.autoScanTimer = setInterval(() => {
      const code = this.sampleBarcodes[this.sampleIndex % this.sampleBarcodes.length];
      this.sampleIndex++;
      this.simulateScan(code);
    }, intervalMs);
  }

  private stopAutoScan(): void {
    if (this.autoScanTimer) {
      clearInterval(this.autoScanTimer);
      this.autoScanTimer = null;
    }
  }

  /**
   * Programmatically trigger a simulated barcode scan
   */
  public simulateScan(barcode: string): BarcodeEvent {
    const event: BarcodeEvent = {
      barcode,
      deviceId: this.id,
      timestamp: new Date().toISOString(),
      symbology: 'EAN13_SIMULATED',
      raw: barcode,
    };

    logger.info(`VirtualBarcode:${this.id}`, `Simulated scan triggered: [${barcode}]`);
    this.emit('barcode', event);
    this.emit('data', event);
    return event;
  }

  protected async doDisconnect(): Promise<void> {
    this.stopAutoScan();
    logger.info(`VirtualBarcode:${this.id}`, 'Virtual Barcode Scanner disconnected');
  }
}
