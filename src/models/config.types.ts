import { ConnectionParams, ConnectionType, DeviceType } from './device.types.js';
import { LogLevel } from '../utils/logger.js';

export interface DeviceConfigItem {
  id: string;
  type: DeviceType;
  driver: string; // e.g., 'hid-barcode', 'serial-barcode', 'xprinter', 'escpos', 'network-printer', 'virtual-barcode', 'virtual-printer'
  name: string;
  enabled?: boolean;
  isDefault?: boolean;
  connectionType: ConnectionType;
  connectionParams?: ConnectionParams;
  options?: Record<string, unknown>;
}

export interface AutoDiscoveryConfig {
  enabled: boolean;
  intervalMs: number;
  scanUsbHid: boolean;
  scanSerial: boolean;
  includeKnownVendorsOnly?: boolean;
}

export interface PrintQueueConfig {
  maxConcurrentJobsPerPrinter: number;
  maxRetries: number;
  retryDelayMs: number;
  jobTimeoutMs: number;
  enableDeduplication: boolean;
  deduplicationWindowMs: number;
}

export interface LoggingConfig {
  level: LogLevel;
  logToFile: boolean;
  filePath?: string;
}

export interface HardwareMcpConfig {
  server: {
    name: string;
    version: string;
    enableVirtualFallback: boolean;
  };
  logging: LoggingConfig;
  autoDiscovery: AutoDiscoveryConfig;
  printQueue: PrintQueueConfig;
  devices: DeviceConfigItem[];
}

