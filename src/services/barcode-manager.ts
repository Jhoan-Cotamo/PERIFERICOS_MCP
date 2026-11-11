import { EventEmitter } from 'node:events';
import { deviceManager } from './device-manager.js';
import { BarcodeEvent, BarcodeScanOptions, BarcodeListenerState } from '../models/barcode.types.js';
import { DeviceTimeoutError } from '../utils/errors.js';
import { VirtualBarcodeDriver } from '../devices/barcode/virtual-barcode-driver.js';
import { logger } from '../utils/logger.js';

export class BarcodeManager extends EventEmitter {
  private static instance: BarcodeManager;
  private recentScans: BarcodeEvent[] = [];
  private maxHistory = 100;
  private isListening = false;
  private activeListenerDeviceId?: string;
  private pendingWaiters: Array<{
    deviceId?: string;
    resolve: (value: BarcodeEvent) => void;
    reject: (reason: unknown) => void;
    timer: NodeJS.Timeout;
  }> = [];

  private constructor() {
    super();
  }

  public static getInstance(): BarcodeManager {
    if (!BarcodeManager.instance) {
      BarcodeManager.instance = new BarcodeManager();
    }
    return BarcodeManager.instance;
  }

  public initialize(): void {
    logger.info('BarcodeManager', 'Initializing BarcodeManager and event hooks...');

    // Subscribe to all scanner devices
    deviceManager.on('deviceStatusChange', (evt) => {
      logger.debug('BarcodeManager', `Device status changed: ${evt.deviceId} -> ${evt.newStatus}`);
    });

    // Auto-hook any barcode devices
    this.attachToAvailableScanners();
  }

  public attachToAvailableScanners(): void {
    const devices = deviceManager.listDevices().filter((d) => d.type === 'barcode_scanner' || d.type === 'qr_scanner');
    for (const d of devices) {
      try {
        const driver = deviceManager.getDevice(d.id);
        driver.removeAllListeners('barcode');
        driver.on('barcode', (event: BarcodeEvent) => {
          this.handleIncomingBarcode(event);
        });
        logger.debug('BarcodeManager', `Hooked barcode listener on device: ${d.id}`);
      } catch (err) {
        logger.warn('BarcodeManager', `Could not hook device ${d.id}: ${String(err)}`);
      }
    }
  }

  private handleIncomingBarcode(event: BarcodeEvent): void {
    logger.info('BarcodeManager', `Received barcode: [${event.barcode}] from device: ${event.deviceId}`);

    // Add to history ring buffer
    this.recentScans.unshift(event);
    if (this.recentScans.length > this.maxHistory) {
      this.recentScans.pop();
    }

    this.emit('scan', event);

    // Resolve any pending waitForBarcode callers
    const remainingWaiters: typeof this.pendingWaiters = [];
    for (const waiter of this.pendingWaiters) {
      if (!waiter.deviceId || waiter.deviceId === event.deviceId) {
        clearTimeout(waiter.timer);
        waiter.resolve(event);
      } else {
        remainingWaiters.push(waiter);
      }
    }
    this.pendingWaiters = remainingWaiters;
  }

  /**
   * Waits for the next barcode scan within a timeout
   */
  public async waitForBarcode(options?: BarcodeScanOptions): Promise<BarcodeEvent> {
    const timeoutMs = options?.timeoutMs || 30000;
    const deviceId = options?.deviceId;

    this.attachToAvailableScanners();

    return new Promise<BarcodeEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from pending
        this.pendingWaiters = this.pendingWaiters.filter((w) => w.timer !== timer);
        reject(new DeviceTimeoutError(deviceId || 'any_scanner', timeoutMs, 'waitForBarcode'));
      }, timeoutMs);

      this.pendingWaiters.push({
        deviceId,
        resolve,
        reject,
        timer,
      });

      logger.info(
        'BarcodeManager',
        `Waiting for barcode scan (Timeout: ${timeoutMs}ms, Device: ${deviceId || 'any'})...`
      );
    });
  }

  /**
   * Retrieves the last scanned barcode from memory
   */
  public getLastBarcode(deviceId?: string): BarcodeEvent | null {
    if (!deviceId) {
      return this.recentScans.length > 0 ? this.recentScans[0] : null;
    }
    return this.recentScans.find((s) => s.deviceId === deviceId) || null;
  }

  /**
   * Starts continuous listener mode
   */
  public startListener(deviceId?: string): BarcodeListenerState {
    this.isListening = true;
    this.activeListenerDeviceId = deviceId;
    this.attachToAvailableScanners();

    logger.info('BarcodeManager', `Barcode listener started (Device: ${deviceId || 'all'})`);

    return this.getListenerState();
  }

  /**
   * Stops continuous listener mode
   */
  public stopListener(deviceId?: string): BarcodeListenerState {
    this.isListening = false;
    this.activeListenerDeviceId = undefined;

    logger.info('BarcodeManager', `Barcode listener stopped`);

    return this.getListenerState();
  }

  public getListenerState(): BarcodeListenerState {
    return {
      isListening: this.isListening,
      activeDeviceId: this.activeListenerDeviceId,
      totalScans: this.recentScans.length,
      lastScan: this.getLastBarcode(this.activeListenerDeviceId) || undefined,
    };
  }

  /**
   * Allows injecting a barcode for simulation or testing
   */
  public simulateBarcode(barcode: string, deviceId?: string): BarcodeEvent {
    let targetId = deviceId;

    if (!targetId) {
      const dev = deviceManager.getDeviceByType('barcode_scanner');
      targetId = dev.id;
    }

    const driver = deviceManager.getDevice(targetId);

    if (driver instanceof VirtualBarcodeDriver) {
      return driver.simulateScan(barcode);
    }

    // Generic simulated dispatch
    const event: BarcodeEvent = {
      barcode,
      deviceId: targetId,
      timestamp: new Date().toISOString(),
      symbology: 'SIMULATED',
      raw: barcode,
    };

    this.handleIncomingBarcode(event);
    return event;
  }
}

export const barcodeManager = BarcodeManager.getInstance();
