export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  discount?: number;
  note?: string;
}

export interface ReceiptTax {
  name: string;
  amount: number;
  percentage?: number;
}

export interface ReceiptOptions {
  deviceId?: string;
  header: string;
  subheader?: string;
  businessInfo?: {
    taxId?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  orderNumber?: string;
  cashier?: string;
  date?: string;
  items: ReceiptItem[];
  taxes?: ReceiptTax[];
  subtotal?: number;
  discountTotal?: number;
  total: number;
  paymentMethod?: string;
  amountPaid?: number;
  change?: number;
  footer?: string;
  cut?: boolean;
  openDrawer?: boolean;
  beep?: boolean;
}

export interface PrintTextOptions {
  deviceId?: string;
  text: string;
  bold?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  doubleHeight?: boolean;
  doubleWidth?: boolean;
  lineFeed?: number;
  cut?: boolean;
}

export type BarcodeType =
  | 'EAN13'
  | 'EAN8'
  | 'CODE39'
  | 'CODE93'
  | 'CODE128'
  | 'ITF'
  | 'UPCA'
  | 'UPCE';

export interface PrintBarcodeOptions {
  deviceId?: string;
  barcode: string;
  type?: BarcodeType;
  width?: number; // 2 to 6
  height?: number; // in dots, e.g. 50 to 200
  position?: 'OFF' | 'ABOVE' | 'BELOW' | 'BOTH';
  cut?: boolean;
}

export interface PrintQRCodeOptions {
  deviceId?: string;
  qrData: string;
  size?: number; // 1 to 16
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  cut?: boolean;
}

export interface CutPaperOptions {
  deviceId?: string;
  partial?: boolean;
}

export interface OpenCashDrawerOptions {
  deviceId?: string;
  pin?: 2 | 5;
}

export type PrintJobType =
  | 'text'
  | 'receipt'
  | 'barcode'
  | 'qr'
  | 'cut'
  | 'drawer'
  | 'raw';

export type PrintJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PrintJob<T = unknown> {
  id: string;
  deviceId: string;
  type: PrintJobType;
  payload: T;
  hash: string;
  status: PrintJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  maxRetries: number;
  error?: string;
}

export interface PrinterStatusInfo {
  deviceId: string;
  name: string;
  status: string;
  isOnline: boolean;
  paperStatus?: 'ok' | 'near_empty' | 'empty' | 'unknown';
  queueLength: number;
  activeJobId?: string;
  totalJobsProcessed: number;
  totalJobsFailed: number;
  lastError?: string;
}
