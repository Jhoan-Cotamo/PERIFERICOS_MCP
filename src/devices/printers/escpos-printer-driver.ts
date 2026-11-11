import ThermalPrinterPkg from 'node-thermal-printer';
const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = ThermalPrinterPkg;

import { BaseDriver, BaseDriverConfig } from '../common/base-driver.js';
import {
  CutPaperOptions,
  OpenCashDrawerOptions,
  PrintBarcodeOptions,
  PrinterStatusInfo,
  PrintQRCodeOptions,
  PrintTextOptions,
  ReceiptOptions,
} from '../../models/printer.types.js';
import { logger } from '../../utils/logger.js';
import { DeviceConnectionError, PrintJobError } from '../../utils/errors.js';

export interface EscPosDriverConfig extends BaseDriverConfig {
  printerType?: 'EPSON' | 'STAR';
  interface?: string;
  characterSet?: string;
  width?: number; // 48 for 80mm, 32 or 42 for 58mm
}

export class EscPosPrinterDriver extends BaseDriver {
  protected printer: InstanceType<typeof ThermalPrinter> | null = null;
  protected width: number = 48;
  protected printerType = PrinterTypes.EPSON;
  protected characterSet = CharacterSet.PC850_MULTILINGUAL;

  constructor(config: EscPosDriverConfig) {
    super({
      ...config,
      type: 'thermal_printer',
    });

    if (config.width) this.width = config.width;
    if (config.printerType === 'STAR') this.printerType = PrinterTypes.STAR;

    // Map character set if provided in options or config
    const csOption = (this.options?.characterSet as string) || config.characterSet;
    if (csOption && (CharacterSet as Record<string, any>)[csOption]) {
      this.characterSet = (CharacterSet as Record<string, any>)[csOption];
    }
  }

  protected resolveInterface(): string {
    if (this.connectionParams?.host) {
      const port = this.connectionParams.tcpPort || 9100;
      return `tcp://${this.connectionParams.host}:${port}`;
    }

    if (this.connectionParams?.port) {
      return this.connectionParams.port; // e.g. COM1 or /dev/ttyUSB0
    }

    if (this.connectionParams?.interfaceName) {
      return this.connectionParams.interfaceName;
    }

    if (typeof this.options?.interface === 'string') {
      return this.options.interface;
    }

    // Default to buffer/memory for raw capturing
    return 'printer:auto';
  }

  protected async doConnect(): Promise<void> {
    const iface = this.resolveInterface();
    logger.debug(`EscPosPrinter:${this.id}`, `Initializing ESC/POS printer on interface: ${iface}`);

    try {
      this.printer = new ThermalPrinter({
        type: this.printerType,
        interface: iface,
        characterSet: this.characterSet,
        removeSpecialCharacters: false,
        lineCharacter: '=',
        width: this.width,
        breakLine: BreakLine.WORD,
      });

      // Verify connection if network printer
      if (iface.startsWith('tcp://')) {
        const isConnected = await this.printer.isPrinterConnected();
        if (!isConnected) {
          logger.warn(`EscPosPrinter:${this.id}`, `TCP printer did not respond immediately, will retry when printing`);
        }
      }
    } catch (err) {
      this.printer = null;
      throw new DeviceConnectionError(this.id, err instanceof Error ? err.message : String(err), err);
    }
  }

  protected ensurePrinter(): InstanceType<typeof ThermalPrinter> {
    if (!this.printer) {
      throw new PrintJobError('none', this.id, 'Printer is not initialized or disconnected.');
    }
    return this.printer;
  }

  public async printText(options: PrintTextOptions): Promise<void> {
    const p = this.ensurePrinter();
    p.clear();

    if (options.align) {
      if (options.align === 'center') p.alignCenter();
      else if (options.align === 'right') p.alignRight();
      else p.alignLeft();
    }

    if (options.bold) p.bold(true);
    if (options.underline) p.underline(true);
    if (options.doubleHeight && options.doubleWidth) {
      p.setTextQuadArea();
    } else if (options.doubleHeight) {
      p.setTextDoubleHeight();
    } else if (options.doubleWidth) {
      p.setTextDoubleWidth();
    }

    p.println(options.text);

    // Reset styles
    p.setTextNormal();
    p.bold(false);
    p.underline(false);
    p.alignLeft();

    const feeds = options.lineFeed ?? 1;
    for (let i = 0; i < feeds; i++) {
      p.newLine();
    }

    if (options.cut) {
      p.cut();
    }

    await this.executePrintBuffer(p);
  }

  public async printReceipt(options: ReceiptOptions): Promise<void> {
    const p = this.ensurePrinter();
    p.clear();

    // 1. Header
    p.alignCenter();
    p.setTextDoubleHeight();
    p.bold(true);
    p.println(options.header);
    p.setTextNormal();
    p.bold(false);

    if (options.subheader) {
      p.println(options.subheader);
    }

    if (options.businessInfo) {
      const b = options.businessInfo;
      if (b.taxId) p.println(`NIT/RUT/ID: ${b.taxId}`);
      if (b.address) p.println(b.address);
      if (b.phone) p.println(`Tel: ${b.phone}`);
      if (b.email) p.println(b.email);
      if (b.website) p.println(b.website);
    }

    p.drawLine();

    // 2. Metadata (Order, Date, Cashier)
    p.alignLeft();
    if (options.orderNumber) {
      p.leftRight('Orden #:', options.orderNumber);
    }
    const dateStr = options.date || new Date().toLocaleString();
    p.leftRight('Fecha:', dateStr);
    if (options.cashier) {
      p.leftRight('Cajero:', options.cashier);
    }

    p.drawLine();

    // 3. Table Header
    p.bold(true);
    // Format: Qty Desc Price Total
    p.println(this.formatTableRow('CANT', 'DESCRIPCIÓN', 'TOTAL'));
    p.bold(false);
    p.drawLine();

    // 4. Items
    for (const item of options.items) {
      const lineTotal = (item.quantity * item.price) - (item.discount || 0);
      const desc = `${item.name}${item.discount ? ` (Desc: -$${item.discount})` : ''}`;
      p.println(this.formatTableRow(`${item.quantity}x`, desc, `$${lineTotal.toFixed(2)}`));
      if (item.note) {
        p.println(`   * ${item.note}`);
      }
    }

    p.drawLine();

    // 5. Totals & Taxes
    p.alignRight();
    if (options.subtotal !== undefined) {
      p.leftRight('Subtotal:', `$${options.subtotal.toFixed(2)}`);
    }
    if (options.discountTotal !== undefined && options.discountTotal > 0) {
      p.leftRight('Descuento:', `-$${options.discountTotal.toFixed(2)}`);
    }
    if (options.taxes && options.taxes.length > 0) {
      for (const tax of options.taxes) {
        const pct = tax.percentage ? ` (${tax.percentage}%)` : '';
        p.leftRight(`${tax.name}${pct}:`, `$${tax.amount.toFixed(2)}`);
      }
    }

    p.newLine();
    p.bold(true);
    p.setTextQuadArea();
    p.leftRight('TOTAL:', `$${options.total.toFixed(2)}`);
    p.setTextNormal();
    p.bold(false);

    // 6. Payment info
    if (options.paymentMethod) {
      p.drawLine();
      p.leftRight('Método de Pago:', options.paymentMethod);
      if (options.amountPaid !== undefined) {
        p.leftRight('Pagado:', `$${options.amountPaid.toFixed(2)}`);
      }
      if (options.change !== undefined) {
        p.leftRight('Cambio:', `$${options.change.toFixed(2)}`);
      }
    }

    // 7. Footer
    p.drawLine();
    p.alignCenter();
    if (options.footer) {
      p.println(options.footer);
    } else {
      p.println('¡Gracias por su compra!');
      p.println('Conserve este comprobante');
    }

    p.newLine();
    p.newLine();

    // 8. Cash Drawer
    if (options.openDrawer) {
      p.openCashDrawer();
    }

    // 9. Cut paper
    if (options.cut !== false) {
      p.cut();
    }

    // 10. Beep / Buzzer if requested
    if (options.beep) {
      p.beep();
    }

    await this.executePrintBuffer(p);
  }

  public async printBarcode(options: PrintBarcodeOptions): Promise<void> {
    const p = this.ensurePrinter();
    p.clear();
    p.alignCenter();

    // Supported formats in node-thermal-printer: CODE128, EAN13, CODE39, etc.
    const barcodeType = options.type || 'CODE128';
    const posMap: Record<string, number> = {
      OFF: 0,
      ABOVE: 1,
      BELOW: 2,
      BOTH: 3,
    };
    const hriPos = options.position ? posMap[options.position] ?? 2 : 2;

    p.printBarcode(options.barcode, barcodeType as any, {
      height: options.height || 70,
      width: (options.width || 2) as any,
      hriPos,
    });

    p.newLine();
    p.newLine();

    if (options.cut) {
      p.cut();
    }

    await this.executePrintBuffer(p);
  }

  public async printQRCode(options: PrintQRCodeOptions): Promise<void> {
    const p = this.ensurePrinter();
    p.clear();
    p.alignCenter();

    p.printQR(options.qrData, {
      cellSize: (options.size || 6) as any,
      correction: (options.errorCorrection || 'M') as any,
    });

    p.newLine();
    p.newLine();

    if (options.cut) {
      p.cut();
    }

    await this.executePrintBuffer(p);
  }

  public async cutPaper(options?: CutPaperOptions): Promise<void> {
    const p = this.ensurePrinter();
    p.clear();
    if (options?.partial) {
      p.partialCut();
    } else {
      p.cut();
    }
    await this.executePrintBuffer(p);
  }

  public async openCashDrawer(options?: OpenCashDrawerOptions): Promise<void> {
    const p = this.ensurePrinter();
    p.clear();
    p.openCashDrawer();
    await this.executePrintBuffer(p);
  }

  protected async executePrintBuffer(printer: InstanceType<typeof ThermalPrinter>): Promise<void> {
    try {
      await printer.execute();
      printer.clear();
      logger.info(`EscPosPrinter:${this.id}`, `Print buffer flushed successfully`);
    } catch (err) {
      printer.clear();
      throw new PrintJobError('buffer', this.id, err instanceof Error ? err.message : String(err), err);
    }
  }

  private formatTableRow(col1: string, col2: string, col3: string): string {
    const w1 = 6;
    const w3 = 10;
    const w2 = Math.max(10, this.width - w1 - w3 - 2);

    const c1 = col1.padEnd(w1).substring(0, w1);
    const c2 = col2.padEnd(w2).substring(0, w2);
    const c3 = col3.padStart(w3).substring(0, w3);

    return `${c1} ${c2} ${c3}`;
  }

  protected async doDisconnect(): Promise<void> {
    if (this.printer) {
      try {
        this.printer.clear();
      } catch {
        // ignore
      }
      this.printer = null;
    }
  }
}
