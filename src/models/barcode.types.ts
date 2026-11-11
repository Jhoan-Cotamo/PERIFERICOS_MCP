export interface BarcodeEvent {
  barcode: string;
  deviceId: string;
  timestamp: string;
  symbology?: string;
  raw?: string;
}

export interface BarcodeScanOptions {
  timeoutMs?: number;
  deviceId?: string;
}

export interface BarcodeListenerState {
  isListening: boolean;
  activeDeviceId?: string;
  totalScans: number;
  lastScan?: BarcodeEvent;
}

