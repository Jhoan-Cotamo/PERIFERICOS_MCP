import { BaseDriver, BaseDriverConfig } from './base-driver.js';
import { DeviceType } from '../../models/device.types.js';
import { logger } from '../../utils/logger.js';
import { UnsupportedDeviceError } from '../../utils/errors.js';

export type DriverFactory = (config: BaseDriverConfig) => BaseDriver;

export interface RegisteredDriverInfo {
  name: string;
  deviceType: DeviceType;
  description: string;
  factory: DriverFactory;
}

export class DriverRegistry {
  private static instance: DriverRegistry;
  private drivers = new Map<string, RegisteredDriverInfo>();

  private constructor() {}

  public static getInstance(): DriverRegistry {
    if (!DriverRegistry.instance) {
      DriverRegistry.instance = new DriverRegistry();
    }
    return DriverRegistry.instance;
  }

  public register(
    name: string,
    deviceType: DeviceType,
    description: string,
    factory: DriverFactory
  ): void {
    const key = name.toLowerCase();
    if (this.drivers.has(key)) {
      logger.warn('DriverRegistry', `Overwriting existing driver registration for: ${key}`);
    }
    this.drivers.set(key, { name: key, deviceType, description, factory });
    logger.debug('DriverRegistry', `Registered driver: ${key} (${deviceType}) - ${description}`);
  }

  public createDriver(driverName: string, config: BaseDriverConfig): BaseDriver {
    const key = driverName.toLowerCase();
    const entry = this.drivers.get(key);

    if (!entry) {
      throw new UnsupportedDeviceError(config.type, driverName);
    }

    return entry.factory(config);
  }

  public hasDriver(driverName: string): boolean {
    return this.drivers.has(driverName.toLowerCase());
  }

  public listRegisteredDrivers(): Array<{ name: string; deviceType: DeviceType; description: string }> {
    return Array.from(this.drivers.values()).map((d) => ({
      name: d.name,
      deviceType: d.deviceType,
      description: d.description,
    }));
  }
}

export const driverRegistry = DriverRegistry.getInstance();
