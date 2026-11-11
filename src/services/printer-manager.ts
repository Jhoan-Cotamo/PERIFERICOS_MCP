import { deviceManager } from './device-manager.js';
import { PrintQueue } from '../devices/common/print-queue.js';
import { EscPosPrinterDriver } from '../devices/printers/escpos-printer-driver.js';
import { VirtualPrinterDriver } from '../devices/printers/virtual-printer-driver.js';
import {
  CutPaperOptions,
  OpenCashDrawerOptions,
  PrintBarcodeOptions,
  PrinterStatusInfo,
  PrintJob,
  PrintQRCodeOptions,
  PrintTextOptions,
  ReceiptOptions,
} from '../models/printer.types.js';
import { PrintQueueConfig } from '../models/config.types.js';
import { logger } from '../utils/logger.js';
import { DeviceNotFoundError, PrintJobError } from '../utils/errors.js';

export class PrinterManager {
  private static instance: PrinterManager;
  private queue: PrintQueue;

  private constructor() {
    this.queue = new PrintQueue({
      maxConcurrentJobsPerPrinter: 1,
      maxRetries: 3,
      retryDelayMs: 1500,
      jobTimeoutMs: 15000,
      enableDeduplication: true,
      deduplicationWindowMs: 4000,
    });
  }

  public static getInstance(): PrinterManager {
    if (!PrinterManager.instance) {
      PrinterManager.instance = new PrinterManager();
    }
    return PrinterManager.instance;
  }

  public initialize(queueConfig?: Partial<PrintQueueConfig>): void {
    if (queueConfig) {
      this.queue.updateConfig(queueConfig);
    }
    logger.info('PrinterManager', 'PrinterManager and PrintQueue initialized.');
  }

  private resolvePrinterDriver(deviceId?: string): EscPosPrinterDriver | VirtualPrinterDriver {
    let driver;
    if (deviceId) {
      driver = deviceManager.getDevice(deviceId);
    } else {
      driver = deviceManager.getDeviceByType('thermal_printer');
    }

    if (driver instanceof EscPosPrinterDriver || driver instanceof VirtualPrinterDriver) {
      return driver;
    }

    throw new PrintJobError('none', deviceId || 'unknown', 'Target device is not a thermal printer.');
  }

  public async printText(options: PrintTextOptions): Promise<PrintJob<PrintTextOptions>> {
    const driver = this.resolvePrinterDriver(options.deviceId);
    const targetId = driver.id;

    return this.queue.enqueue<PrintTextOptions>(
      targetId,
      'text',
      options,
      async () => {
        await driver.printText(options);
      }
    );
  }

  public async printReceipt(options: ReceiptOptions): Promise<PrintJob<ReceiptOptions>> {
    const driver = this.resolvePrinterDriver(options.deviceId);
    const targetId = driver.id;

    return this.queue.enqueue<ReceiptOptions>(
      targetId,
      'receipt',
      options,
      async () => {
        await driver.printReceipt(options);
      }
    );
  }

  public async printBarcode(options: PrintBarcodeOptions): Promise<PrintJob<PrintBarcodeOptions>> {
    const driver = this.resolvePrinterDriver(options.deviceId);
    const targetId = driver.id;

    return this.queue.enqueue<PrintBarcodeOptions>(
      targetId,
      'barcode',
      options,
      async () => {
        await driver.printBarcode(options);
      }
    );
  }

  public async printQRCode(options: PrintQRCodeOptions): Promise<PrintJob<PrintQRCodeOptions>> {
    const driver = this.resolvePrinterDriver(options.deviceId);
    const targetId = driver.id;

    return this.queue.enqueue<PrintQRCodeOptions>(
      targetId,
      'qr',
      options,
      async () => {
        await driver.printQRCode(options);
      }
    );
  }

  public async cutPaper(options?: CutPaperOptions): Promise<PrintJob<CutPaperOptions | undefined>> {
    const driver = this.resolvePrinterDriver(options?.deviceId);
    const targetId = driver.id;

    return this.queue.enqueue<CutPaperOptions | undefined>(
      targetId,
      'cut',
      options,
      async () => {
        await driver.cutPaper(options);
      }
    );
  }

  public async openCashDrawer(options?: OpenCashDrawerOptions): Promise<PrintJob<OpenCashDrawerOptions | undefined>> {
    const driver = this.resolvePrinterDriver(options?.deviceId);
    const targetId = driver.id;

    return this.queue.enqueue<OpenCashDrawerOptions | undefined>(
      targetId,
      'drawer',
      options,
      async () => {
        await driver.openCashDrawer(options);
      }
    );
  }

  public async getPrinterStatus(deviceId?: string): Promise<PrinterStatusInfo> {
    const driver = this.resolvePrinterDriver(deviceId);
    const info = await driver.getStatus();
    const stats = this.queue.getStats();

    return {
      deviceId: driver.id,
      name: driver.name,
      status: info.status,
      isOnline: driver.isAvailable(),
      paperStatus: 'ok',
      queueLength: this.queue.getQueueLength(driver.id),
      activeJobId: this.queue.getActiveJob(driver.id)?.id,
      totalJobsProcessed: stats.totalProcessed,
      totalJobsFailed: stats.totalFailed,
    };
  }

  public getConnectedPrinters(): Array<{ id: string; name: string; status: string; connectionType: string }> {
    return deviceManager.getDevicesListByType('thermal_printer').map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      connectionType: p.connectionType,
    }));
  }
}

export const printerManager = PrinterManager.getInstance();
