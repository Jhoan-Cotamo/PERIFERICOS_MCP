import { EventEmitter } from 'node:events';

export type DeviceType =
  | 'thermal_printer'
  | 'barcode_scanner'
  | 'qr_scanner'
  | 'serial_device'
  | 'scale'
  | 'cash_drawer'
  | 'rfid_reader'
  | 'custom_usb';

export type DeviceStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'reconnecting'
  | 'busy'
  | 'error';

export type ConnectionType = 'usb_hid' | 'usb_raw' | 'serial' | 'tcp' | 'virtual';

export interface ConnectionParams {
  vendorId?: number;
  productId?: number;
  path?: string;
  serialNumber?: string;
  port?: string;
  baudRate?: number;
  host?: string;
  tcpPort?: number;
  interfaceName?: string;
}

export interface IDeviceInfo {
  id: string;
  type: DeviceType;
  name: string;
  status: DeviceStatus;
  connectionType: ConnectionType;
  connectionParams?: ConnectionParams;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  metadata?: Record<string, unknown>;
  lastSeen?: string;
}

export interface IDeviceDriver extends EventEmitter {
  readonly id: string;
  readonly type: DeviceType;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly info: IDeviceInfo;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<IDeviceInfo>;
  isAvailable(): boolean;
}
