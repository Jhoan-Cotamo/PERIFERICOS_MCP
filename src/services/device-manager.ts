import { EventEmitter } from 'node:events';
import HID from 'node-hid';
import { SerialPort } from 'serialport';
import { BaseDriver } from '../devices/common/base-driver.js';
import { driverRegistry } from '../devices/common/driver-registry.js';
import { HidBarcodeDriver } from '../devices/barcode/hid-barcode-driver.js';
import { SerialBarcodeDriver } from '../devices/barcode/serial-barcode-driver.js';
import { VirtualBarcodeDriver } from '../devices/barcode/virtual-barcode-driver.js';
import { EscPosPrinterDriver } from '../devices/printers/escpos-printer-driver.js';
import { XPrinterDriver } from '../devices/printers/xprinter-driver.js';
import { NetworkPrinterDriver } from '../devices/printers/network-printer-driver.js';
import { VirtualPrinterDriver } from '../devices/printers/virtual-printer-driver.js';
import { GenericSerialDriver } from '../devices/serial/generic-serial-driver.js';

import { DeviceType, IDeviceInfo } from '../models/device.types.js';
import { HardwareMcpConfig, DeviceConfigItem } from '../models/config.types.js';
import { isLikelyBarcodeScanner } from '../utils/hid-utils.js';
import { DeviceNotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export class DeviceManager extends EventEmitter {
  private static instance: DeviceManager;
  private devices = new Map<string, BaseDriver>();
  private defaultDevices = new Map<DeviceType, string>();
  private discoveryTimer: NodeJS.Timeout | null = null;
  private knownHardwarePaths = new Set<string>();

  private constructor() {
    super();
    this.registerBuiltInDrivers();
  }

  public static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  private registerBuiltInDrivers(): void {
    driverRegistry.register(
      'hid-barcode',
      'barcode_scanner',
      'USB HID Raw/Keyboard Barcode and QR Scanner',
      (config) => new HidBarcodeDriver(config)
    );

    driverRegistry.register(
      'serial-barcode',
      'barcode_scanner',
      'Serial COM / RS-232 / USB-VCP Barcode Scanner',
      (config) => new SerialBarcodeDriver(config)
    );

    driverRegistry.register(
      'virtual-barcode',
      'barcode_scanner',
      'Virtual Simulated Barcode Scanner',
      (config) => new VirtualBarcodeDriver(config)
    );

    driverRegistry.register(
      'escpos',
      'thermal_printer',
      'Universal ESC/POS Thermal Receipt Printer',
      (config) => new EscPosPrinterDriver(config)
    );

    driverRegistry.register(
      'xprinter',
      'thermal_printer',
      'XPrinter Thermal Series (XP-N160I, XP-58, XP-80) with Buzzer',
      (config) => new XPrinterDriver(config)
    );

    driverRegistry.register(
      'network-printer',
      'thermal_printer',
      'Direct TCP/IP ESC/POS Network Printer (Port 9100)',
      (config) => new NetworkPrinterDriver(config as any)
    );

    driverRegistry.register(
      'virtual-printer',
      'thermal_printer',
      'Virtual Thermal Printer with Spool Preview',
      (config) => new VirtualPrinterDriver(config)
    );

    driverRegistry.register(
      'generic-serial',
      'serial_device',
      'Generic Serial Port Device (Scales, RFID, Sensors)',
      (config) => new GenericSerialDriver(config)
    );
  }

  public async initialize(config: HardwareMcpConfig): Promise<void> {
    logger.info('DeviceManager', 'Initializing device manager and configured devices...');

    // Load static configured devices
    for (const item of config.devices) {
      if (item.enabled !== false) {
        try {
          await this.addDeviceFromConfig(item);
        } catch (err) {
          logger.error('DeviceManager', `Failed to initialize configured device '${item.id}': ${String(err)}`);
        }
      }
    }

    // Start auto-discovery if enabled
    if (config.autoDiscovery.enabled) {
      this.startAutoDiscovery(config);
    }
  }

  public async addDeviceFromConfig(item: DeviceConfigItem): Promise<BaseDriver> {
    const driver = driverRegistry.createDriver(item.driver, {
      id: item.id,
      type: item.type,
      name: item.name,
      connectionType: item.connectionType,
      connectionParams: item.connectionParams,
      options: item.options,
    });

    this.registerDevice(driver, item.isDefault);

    try {
      await driver.connect();
    } catch (err) {
      logger.warn('DeviceManager', `Device '${item.id}' failed initial connection (will retry): ${String(err)}`);
    }

    return driver;
  }

  public registerDevice(driver: BaseDriver, isDefault = false): void {
    if (this.devices.has(driver.id)) {
      logger.warn('DeviceManager', `Device with id '${driver.id}' already exists. Replacing.`);
    }

    this.devices.set(driver.id, driver);

    if (isDefault || !this.defaultDevices.has(driver.type)) {
      this.defaultDevices.set(driver.type, driver.id);
    }

    driver.on('statusChange', (event) => {
      this.emit('deviceStatusChange', event);
    });

    logger.info('DeviceManager', `Registered device: ${driver.id} [${driver.name}] (${driver.type})`);
  }

  public getDevice(deviceId?: string): BaseDriver {
    if (deviceId) {
      const dev = this.devices.get(deviceId);
      if (!dev) {
        throw new DeviceNotFoundError(deviceId);
      }
      return dev;
    }

    // If no deviceId specified, return the default device for barcode scanner or printer
    const first = this.devices.values().next().value;
    if (!first) {
      throw new DeviceNotFoundError('default');
    }
    return first;
  }

  public getDeviceByType(type: DeviceType, preferredId?: string): BaseDriver {
    if (preferredId && this.devices.has(preferredId)) {
      const d = this.devices.get(preferredId)!;
      if (d.type === type) return d;
    }

    const defaultId = this.defaultDevices.get(type);
    if (defaultId && this.devices.has(defaultId)) {
      return this.devices.get(defaultId)!;
    }

    // Look for first connected device of this type
    for (const d of this.devices.values()) {
      if (d.type === type) {
        return d;
      }
    }

    throw new DeviceNotFoundError(`No device of type '${type}' found.`);
  }

  public listDevices(): IDeviceInfo[] {
    return Array.from(this.devices.values()).map((d) => d.info);
  }

  public getDevicesListByType(type: DeviceType): IDeviceInfo[] {
    return Array.from(this.devices.values())
      .filter((d) => d.type === type)
      .map((d) => d.info);
  }

  public async getDeviceStatus(deviceId: string): Promise<IDeviceInfo> {
    const dev = this.getDevice(deviceId);
    return dev.getStatus();
  }

  /**
   * Hardware auto-discovery background scanner
   */
  public startAutoDiscovery(config: HardwareMcpConfig): void {
    this.stopAutoDiscovery();

    logger.info('DeviceManager', `Starting auto-discovery loop (every ${config.autoDiscovery.intervalMs}ms)`);

    const runScan = async () => {
      try {
        if (config.autoDiscovery.scanUsbHid) {
          await this.scanUsbHidDevices(config);
        }
        if (config.autoDiscovery.scanSerial) {
          await this.scanSerialDevices();
        }
      } catch (err) {
        logger.debug('DeviceManager', `Auto-discovery scan cycle error: ${String(err)}`);
      }
    };

    // Run first scan immediately
    runScan();

    this.discoveryTimer = setInterval(runScan, config.autoDiscovery.intervalMs);
  }

  private async scanUsbHidDevices(config: HardwareMcpConfig): Promise<void> {
    try {
      const hidDevices = HID.devices();

      for (const hid of hidDevices) {
        if (!hid.path) continue;

        const isBarcode = isLikelyBarcodeScanner(hid);

        if (isBarcode && !this.knownHardwarePaths.has(hid.path)) {
          this.knownHardwarePaths.add(hid.path);

          const autoId = `hid-scanner-${hid.vendorId?.toString(16) || '0'}-${hid.productId?.toString(16) || '0'}`;
          if (!this.devices.has(autoId)) {
            logger.info(
              'DeviceManager',
              `Auto-discovered USB Barcode Scanner: ${hid.product || 'Barcode Scanner'} (Path: ${hid.path})`
            );

            const driver = driverRegistry.createDriver('hid-barcode', {
              id: autoId,
              type: 'barcode_scanner',
              name: hid.product || `USB Barcode Scanner (${hid.vendorId})`,
              connectionType: 'usb_hid',
              connectionParams: {
                vendorId: hid.vendorId,
                productId: hid.productId,
                path: hid.path,
                serialNumber: hid.serialNumber,
              },
            });

            this.registerDevice(driver, false);
            driver.connect().catch((e) => logger.debug('DeviceManager', `Auto-connect error: ${e.message}`));
          }
        }
      }
    } catch (err) {
      logger.debug('DeviceManager', `HID scanning error: ${String(err)}`);
    }
  }

  private async scanSerialDevices(): Promise<void> {
    try {
      const ports = await SerialPort.list();
      for (const port of ports) {
        if (!port.path) continue;

        if (!this.knownHardwarePaths.has(port.path)) {
          this.knownHardwarePaths.add(port.path);
          logger.debug('DeviceManager', `Discovered Serial Port: ${port.path} (${port.manufacturer || 'Unknown'})`);
        }
      }
    } catch (err) {
      logger.debug('DeviceManager', `Serial scan error: ${String(err)}`);
    }
  }

  public stopAutoDiscovery(): void {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
  }

  public async shutdown(): Promise<void> {
    this.stopAutoDiscovery();
    logger.info('DeviceManager', 'Shutting down all hardware connections...');

    for (const dev of this.devices.values()) {
      try {
        await dev.disconnect();
      } catch (err) {
        logger.warn('DeviceManager', `Error disconnecting device ${dev.id}: ${String(err)}`);
      }
    }
    this.devices.clear();
  }
}

export const deviceManager = DeviceManager.getInstance();

